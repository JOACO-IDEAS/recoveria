import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { evaluateAll } from "../../src/modules/client-zero/ground-truth-evaluation";
import { mergeNewDocuments, readGroundTruth, writeGroundTruth, applyFieldLabel } from "../../src/modules/client-zero/ground-truth-store";
import { REVIEWABLE_FIELD_NAMES, type DocumentProposal, type FieldLabelStatus, type GroundTruthStore } from "../../src/modules/client-zero/ground-truth-types";

// Phase 8B.2: private, local-only founder review server. Binds to
// 127.0.0.1 only -- never 0.0.0.0, never deployed, never reachable from
// outside this machine. Serves generic, data-free UI assets (tracked) and
// an API that only ever reads/writes private, gitignored JSON files plus
// streams the original authorized PDFs from the private corpus boundary.

const REPO_ROOT = path.resolve(process.cwd());
const PRIVATE_ANALYSIS_ROOT = path.join(REPO_ROOT, ".private", "client-zero", "analysis");
const AUTHORIZED_CORPUS_ROOT = path.join(REPO_ROOT, ".private", "client-zero", "invoices", "discovery-01");
const PROPOSALS_PATH = path.join(PRIVATE_ANALYSIS_ROOT, "phase-8b2-pipeline-proposals.json");
const GROUND_TRUTH_PATH = path.join(PRIVATE_ANALYSIS_ROOT, "phase-8b2-ground-truth.json");
const UI_ROOT = path.join(REPO_ROOT, "scripts", "client-zero", "review-ui");
const PORT = Number(process.env.RECOVERIA_REVIEW_SERVER_PORT ?? 4873);
const HOST = "127.0.0.1";

const FIELD_LABEL_STATUSES: readonly FieldLabelStatus[] = ["UNREVIEWED", "CORRECT", "INCORRECT", "NOT_PRESENT_IN_DOCUMENT", "UNCERTAIN"];

async function loadProposals(): Promise<readonly DocumentProposal[]> {
  const raw = await readFile(PROPOSALS_PATH, "utf8");
  return JSON.parse(raw) as readonly DocumentProposal[];
}

async function loadOrInitGroundTruth(proposals: readonly DocumentProposal[]): Promise<GroundTruthStore> {
  const existing = await readGroundTruth(GROUND_TRUTH_PATH);
  const merged = existing ? mergeNewDocuments(existing, proposals) : mergeNewDocuments({}, proposals);
  if (!existing) await writeGroundTruth(GROUND_TRUTH_PATH, merged);
  return merged;
}

function json(body: unknown): { status: number; headers: Record<string, string>; body: string } {
  return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
function errorResponse(status: number, error: string) {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify({ error }) };
}

const MIME_TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

async function serveStatic(requestPath: string): Promise<{ status: number; headers: Record<string, string>; body: Buffer | string } | null> {
  const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const resolved = path.resolve(UI_ROOT, relative);
  if (!resolved.startsWith(`${UI_ROOT}${path.sep}`) && resolved !== UI_ROOT) return null;
  try {
    const body = await readFile(resolved);
    const extension = path.extname(resolved);
    return { status: 200, headers: { "content-type": MIME_TYPES[extension] ?? "application/octet-stream" }, body };
  } catch { return null; }
}

async function main(): Promise<void> {
  const proposals = await loadProposals();
  if (proposals.length !== 20) throw new Error(`REVIEW_SERVER_PROPOSAL_COUNT_MISMATCH: expected 20, found ${proposals.length}`);
  let groundTruth = await loadOrInitGroundTruth(proposals);
  const proposalsById = new Map(proposals.map((proposal) => [proposal.privateSafeDocumentId, proposal]));
  const authorizedCorpusRoot = await realpath(AUTHORIZED_CORPUS_ROOT);

  const server = createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? "/", `http://${HOST}`);
        const documentMatch = url.pathname.match(/^\/api\/documents\/([^/]+)(\/pdf)?$/);

        if (request.method === "GET" && url.pathname === "/api/documents") {
          const result = proposals.map((proposal) => ({ proposal, groundTruth: groundTruth[proposal.privateSafeDocumentId] }));
          return respond(response, json(result));
        }

        if (request.method === "GET" && url.pathname === "/api/evaluation") {
          return respond(response, json(evaluateAll(proposals, groundTruth)));
        }

        if (request.method === "GET" && documentMatch && !documentMatch[2]) {
          const proposal = proposalsById.get(documentMatch[1]);
          if (!proposal) return respond(response, errorResponse(404, "DOCUMENT_NOT_FOUND"));
          return respond(response, json({ proposal, groundTruth: groundTruth[proposal.privateSafeDocumentId] }));
        }

        if (request.method === "GET" && documentMatch && documentMatch[2]) {
          const proposal = proposalsById.get(documentMatch[1]);
          if (!proposal) return respond(response, errorResponse(404, "DOCUMENT_NOT_FOUND"));
          const resolved = await realpath(path.resolve(authorizedCorpusRoot, proposal.pdfFileName));
          if (!resolved.startsWith(`${authorizedCorpusRoot}${path.sep}`)) return respond(response, errorResponse(403, "PDF_OUTSIDE_AUTHORIZED_BOUNDARY"));
          const info = await stat(resolved);
          response.writeHead(200, { "content-type": "application/pdf", "content-length": info.size, "cache-control": "no-store", "x-content-type-options": "nosniff" });
          createReadStream(resolved).pipe(response);
          return;
        }

        if (request.method === "POST" && documentMatch && !documentMatch[2]) {
          const proposal = proposalsById.get(documentMatch[1]);
          if (!proposal) return respond(response, errorResponse(404, "DOCUMENT_NOT_FOUND"));
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(chunk as Buffer);
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { fieldName?: string; status?: string; correctedValue?: string | null; note?: string | null; reviewer?: string };
          if (!payload.reviewer || typeof payload.reviewer !== "string" || payload.reviewer.trim() === "") return respond(response, errorResponse(400, "REVIEWER_REQUIRED"));
          if (!payload.fieldName || !(REVIEWABLE_FIELD_NAMES as readonly string[]).includes(payload.fieldName)) return respond(response, errorResponse(400, "INVALID_FIELD_NAME"));
          if (!payload.status || !FIELD_LABEL_STATUSES.includes(payload.status as FieldLabelStatus)) return respond(response, errorResponse(400, "INVALID_STATUS"));
          groundTruth = applyFieldLabel(groundTruth, {
            documentId: proposal.privateSafeDocumentId,
            fieldName: payload.fieldName as (typeof REVIEWABLE_FIELD_NAMES)[number],
            status: payload.status as FieldLabelStatus,
            correctedValue: payload.correctedValue ?? null,
            note: payload.note ?? null,
            reviewer: payload.reviewer.trim(),
          });
          await writeGroundTruth(GROUND_TRUTH_PATH, groundTruth);
          return respond(response, json({ saved: true, document: groundTruth[proposal.privateSafeDocumentId] }));
        }

        const staticFile = await serveStatic(url.pathname);
        if (staticFile) return respond(response, staticFile);
        return respond(response, errorResponse(404, "NOT_FOUND"));
      } catch (error) {
        console.error(JSON.stringify({ event: "REVIEW_SERVER_ERROR", message: error instanceof Error ? error.message : "UNKNOWN" }));
        return respond(response, errorResponse(500, "INTERNAL_ERROR"));
      }
    })();
  });

  function respond(response: import("node:http").ServerResponse, result: { status: number; headers: Record<string, string>; body: Buffer | string }): void {
    response.writeHead(result.status, result.headers);
    response.end(result.body);
  }

  server.listen(PORT, HOST, () => {
    console.log(JSON.stringify({ event: "REVIEW_SERVER_READY", host: HOST, port: PORT, documents: proposals.length, url: `http://${HOST}:${PORT}/` }));
  });
}

void main();
