import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { REVIEWABLE_FIELD_NAMES, type DocumentProposal, type ReviewableFieldName } from "../../src/modules/client-zero/ground-truth-types";

// Phase 8B.2: ONE read-only snapshot of the already-persisted Phase 8B.1
// canary results into a private JSON file, so the local review server never
// needs database credentials for day-to-day founder review sessions. This
// performs zero writes to recoveria_client_zero.

const REPO_ROOT = path.resolve(process.cwd());
const ORGANIZATION_ID = "recoveria-client-zero";
const OUTPUT_PATH = path.join(REPO_ROOT, ".private", "client-zero", "analysis", "phase-8b2-pipeline-proposals.json");

async function main(): Promise<void> {
  const databaseUrl = process.env.RECOVERIA_DATABASE_URL;
  if (!databaseUrl) throw new Error("RECOVERIA_DATABASE_URL_REQUIRED");
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  const dbIdentity = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  if (dbIdentity[0]?.db !== "recoveria_client_zero") throw new Error(`EXPORT_DATABASE_BOUNDARY_REJECTED: connected to ${dbIdentity[0]?.db}`);

  const batch = await prisma.importBatch.findFirst({ where: { organizationId: ORGANIZATION_ID }, orderBy: { createdAt: "desc" } });
  if (!batch) throw new Error("EXPORT_NO_IMPORT_BATCH_FOUND");

  const documents = await prisma.sourceDocument.findMany({
    where: { organizationId: ORGANIZATION_ID, importBatchId: batch.id },
    orderBy: { fileName: "asc" },
    include: { extractionResults: { include: { fields: true } }, importCandidates: true },
  });
  if (documents.length !== 20) throw new Error(`EXPORT_DOCUMENT_COUNT_MISMATCH: expected 20, found ${documents.length}`);

  const proposals: DocumentProposal[] = documents.map((document, index) => {
    const extraction = document.extractionResults[0];
    const fieldsByName = new Map(extraction?.fields.map((field) => [field.fieldName, field]) ?? []);
    const candidate = document.importCandidates[0];
    const fields = Object.fromEntries(REVIEWABLE_FIELD_NAMES.map((name: ReviewableFieldName) => {
      const row = fieldsByName.get(name);
      return [name, { raw: row?.rawValue ?? null, normalized: row?.normalizedValue ?? null, sourceLocation: row?.sourceLocation ?? null }];
    })) as DocumentProposal["fields"];
    return {
      documentId: document.id,
      privateSafeDocumentId: `client-zero-canary-${String(index + 1).padStart(2, "0")}`,
      importBatchId: batch.id,
      reviewReasons: candidate?.reviewReasons ?? [],
      pdfFileName: document.storageKey,
      fields,
    };
  });

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true, mode: 0o700 });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(proposals, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ exported: proposals.length, importBatchId: batch.id, outputPath: "(.private/client-zero/analysis/phase-8b2-pipeline-proposals.json)" }));
  await prisma.$disconnect();
}

void main();
