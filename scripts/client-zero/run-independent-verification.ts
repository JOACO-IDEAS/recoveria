import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyPdfBlindly } from "../../src/modules/client-zero/independent-verifier";
import type { IndependentVerificationArtifact } from "../../src/modules/client-zero/independent-verification-types";

// This executable is the blindness boundary. It intentionally imports no
// proposal, extraction, candidate, comparison, or ground-truth module and
// opens only the authorized PDF corpus.
const REPO_ROOT = path.resolve(process.cwd());
const CORPUS_ROOT = path.join(REPO_ROOT, ".private", "client-zero", "invoices", "discovery-01");
const ANALYSIS_ROOT = path.join(REPO_ROOT, ".private", "client-zero", "analysis");
const OUTPUT_PATH = path.join(ANALYSIS_ROOT, "phase-8b2a-independent-verification.json");
const SWIFT_SCRIPT = path.join(REPO_ROOT, "scripts", "client-zero", "apple-vision-ocr.swift");
const VERIFIER_VERSION = "VNRecognizeTextRequest.accurate-v2-white-background+interpretation-v3";

async function readExisting(): Promise<IndependentVerificationArtifact | null> {
  try { return JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as IndependentVerificationArtifact; }
  catch (error) { if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function main(): Promise<void> {
  const corpusRoot = await realpath(CORPUS_ROOT);
  const entries = (await readdir(corpusRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length !== 20) throw new Error(`INDEPENDENT_VERIFIER_CORPUS_COUNT_MISMATCH:${entries.length}`);
  const existing = await readExisting();
  if (existing && (existing.schemaVersion !== 1 || existing.verifierContractVersion !== "phase-8b2a-v1")) throw new Error("INDEPENDENT_VERIFIER_ARTIFACT_VERSION_MISMATCH");
  const prior = new Map(existing?.documents.map((document) => [document.documentId, document]) ?? []);
  const documents = [];
  let executed = 0, reused = 0;
  for (const [index, entry] of entries.entries()) {
    const candidate = await realpath(path.join(corpusRoot, entry.name));
    if (!candidate.startsWith(`${corpusRoot}${path.sep}`)) throw new Error("INDEPENDENT_VERIFIER_BOUNDARY_REJECTED");
    const bytes = await readFile(candidate);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const documentId = `client-zero-canary-${String(index + 1).padStart(2, "0")}`;
    const priorDocument = prior.get(documentId);
    if (priorDocument?.inputSha256 === sha256 && priorDocument.verifier.provider === "APPLE_VISION_OCR" && priorDocument.verifier.version === VERIFIER_VERSION) { documents.push(priorDocument); reused += 1; continue; }
    documents.push(await verifyPdfBlindly({ documentId, pdfPath: candidate, sha256 }, SWIFT_SCRIPT));
    executed += 1;
  }
  const artifact: IndependentVerificationArtifact = { schemaVersion: 1, verifierContractVersion: "phase-8b2a-v1", documents };
  await mkdir(ANALYSIS_ROOT, { recursive: true, mode: 0o700 });
  const temporary = `${OUTPUT_PATH}.tmp`;
  await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, OUTPUT_PATH);
  console.log(JSON.stringify({ documents: documents.length, executed, reused, provider: "APPLE_VISION_OCR", output: ".private/client-zero/analysis/phase-8b2a-independent-verification.json" }));
}

void main();
