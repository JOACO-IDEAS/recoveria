import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { clientZeroPreflight } from "../../src/modules/client-zero/preflight";
import { clientZeroEnvironmentPreflight } from "../../src/modules/client-zero/environment-preflight";
import { assertClientZeroIngestionAllowed } from "../../src/modules/client-zero/kill-switch";
import { LocalFolderSource } from "../../src/modules/ingestion/local-folder-source";
import { DeterministicDocumentUnderstandingProvider } from "../../src/modules/ingestion/document-understanding-provider";
import { proposeDocumentRelationships, type CohortDocument } from "../../src/modules/ingestion/document-relationships";
import { proposeCustomerIdentityClusters, type CustomerIdentitySignal } from "../../src/modules/entity-resolution/cohort-clustering";
import { persistCanaryImportBatch, type CanaryDocumentMetadata } from "../../src/modules/client-zero/durable-canary-ingestion";
import type { StructuredDocumentUnderstanding } from "../../src/modules/ingestion/types";

const REPO_ROOT = path.resolve(process.cwd());
const AUTHORIZED_CORPUS_ROOT = path.join(REPO_ROOT, ".private", "client-zero", "invoices", "discovery-01");
const PRIVATE_ANALYSIS_ROOT = path.join(REPO_ROOT, ".private", "client-zero", "analysis");
const EXPECTED_DOCUMENT_COUNT = 20;
const ORGANIZATION_ID = "recoveria-client-zero";

function extracted(value: { readonly normalized: unknown }): boolean { return value.normalized !== null && value.normalized !== undefined; }
function dateExtracted(u: StructuredDocumentUnderstanding | undefined, semantic: string): boolean {
  return u?.dates.some((d) => d.semantic === semantic && d.normalized !== null) ?? false;
}

async function dryRunPreflight(): Promise<{ ok: boolean; report: Record<string, unknown> }> {
  const gitBoundary = clientZeroPreflight(REPO_ROOT);
  const envPreflight = clientZeroEnvironmentPreflight(process.env);
  let corpusCount = -1;
  let corpusCountOk = false;
  try {
    const entries = await readdir(AUTHORIZED_CORPUS_ROOT);
    corpusCount = entries.filter((name) => name.toLowerCase().endsWith(".pdf")).length;
    corpusCountOk = corpusCount === EXPECTED_DOCUMENT_COUNT;
  } catch { corpusCountOk = false; }

  const killSwitchOk = (() => { try { assertClientZeroIngestionAllowed(process.env); return true; } catch { return false; } })();

  const report = {
    environment: process.env.RECOVERIA_ENVIRONMENT ?? null,
    database: "recoveria_client_zero (see RECOVERIA_DATABASE_URL pathname, not printed)",
    tenant: ORGANIZATION_ID,
    corpusCount,
    corpusCountExpected: EXPECTED_DOCUMENT_COUNT,
    corpusCountOk,
    corpusPrivateUntracked: gitBoundary.ok,
    sourceType: "LOCAL_FOLDER (authorized private corpus, not Drive)",
    driveExecutionDisabled: true,
    collectionsDisabled: envPreflight.checks.collectionsDisabled,
    outboundCommunicationsDisabled: envPreflight.checks.outboundCommunicationDisabled,
    accountingAssertionsUnavailable: true,
    fixtureFallbackDisabled: envPreflight.checks.syntheticFixtureFallbackDisabled,
    killSwitchControlsIngestion: true,
    killSwitchCurrentlyOpen: killSwitchOk,
    environmentPreflight: envPreflight,
  };
  const ok = gitBoundary.ok && envPreflight.ok && corpusCountOk && killSwitchOk;
  return { ok, report };
}

async function main(): Promise<void> {
  const dryRun = await dryRunPreflight();
  console.log(JSON.stringify({ phase: "DRY_RUN_PREFLIGHT", ...dryRun }));
  if (!dryRun.ok) { console.error(JSON.stringify({ phase: "DRY_RUN_PREFLIGHT", result: "FAIL", message: "Stopping before any invoice content is read." })); process.exit(1); }

  assertClientZeroIngestionAllowed(process.env); // re-asserted immediately before any content read, not just in the dry-run report

  const source = await LocalFolderSource.create(ORGANIZATION_ID, "authorized-private-local-corpus-discovery-01", AUTHORIZED_CORPUS_ROOT);
  const discovered = await source.discover();
  if (discovered.length !== EXPECTED_DOCUMENT_COUNT) throw new Error(`CANARY_CORPUS_COUNT_MISMATCH: expected ${EXPECTED_DOCUMENT_COUNT}, found ${discovered.length}`);

  const loaded = await Promise.all(discovered.map(async (doc) => ({ doc, bytes: await doc.readContent() })));
  const metadata: CanaryDocumentMetadata[] = loaded.map(({ doc, bytes }) => ({
    documentId: doc.sourceDocumentId, fileName: doc.displayName, declaredMediaType: doc.mimeType,
    byteSize: bytes.length, contentHash: createHash("sha256").update(bytes).digest("hex"), locator: doc.provenance.locator,
  }));
  const corpusFingerprint = createHash("sha256").update(metadata.map((m) => `${m.documentId}:${m.contentHash}`).sort().join("\n")).digest("hex");
  const idempotencyKey = `client-zero-canary-v1:${corpusFingerprint}`;

  const provider = new DeterministicDocumentUnderstandingProvider();
  const result = await provider.understand({
    organizationId: ORGANIZATION_ID, idempotencyKey,
    documents: loaded.map(({ doc, bytes }) => ({ id: doc.sourceDocumentId, organizationId: ORGANIZATION_ID, fileName: doc.displayName, declaredMediaType: doc.mimeType, bytes })),
    entityCatalog: [],
  });

  const cohortDocuments: CohortDocument[] = result.results.flatMap((item) => item.understanding ? [{ documentId: item.documentId, understanding: item.understanding }] : []);
  const relationshipReport = proposeDocumentRelationships(cohortDocuments);
  const identitySignals: CustomerIdentitySignal[] = cohortDocuments.map(({ documentId, understanding }) => ({
    sourceRef: documentId, taxId: understanding.customerTaxId.normalized, normalizedName: understanding.customerName.normalized,
    normalizedAddress: understanding.customerAddress.normalized,
    evidence: understanding.customerTaxId.raw ? [{ documentId, location: { kind: "PDF_TEXT" as const }, rawValue: understanding.customerTaxId.raw }] : [],
  }));
  const identityClusters = proposeCustomerIdentityClusters(identitySignals);

  const databaseUrl = process.env.RECOVERIA_DATABASE_URL;
  if (!databaseUrl) throw new Error("RECOVERIA_DATABASE_URL_REQUIRED");
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const dbIdentity = await prisma.$queryRawUnsafe<Array<{ db: string }>>('select current_database() as db');
  if (dbIdentity[0]?.db !== "recoveria_client_zero") throw new Error(`CANARY_PERSIST_DATABASE_BOUNDARY_REJECTED: connected to ${dbIdentity[0]?.db}`);

  const persisted = await persistCanaryImportBatch(prisma, {
    organizationId: ORGANIZATION_ID, importBatchLabel: "Phase 8B.1 Client Zero canary (20 authorized invoices)",
    createdBy: "founder-operator", idempotencyKey, result, documents: metadata,
  });

  const coreFields = (u?: StructuredDocumentUnderstanding) => ({
    invoiceNumber: Boolean(u && extracted(u.invoiceNumber) && extracted(u.pointOfSale)),
    issueDate: dateExtracted(u, "ISSUE_DATE"),
    dueDate: dateExtracted(u, "PAYMENT_DUE_DATE"),
    nominalAmount: Boolean(u && extracted(u.documentedNominalTotalCents)),
    currency: Boolean(u && extracted(u.currency)),
    provenance: Boolean(u?.observations.length && u.observations.every((o) => o.page > 0 && o.parserVersion && o.extractionMethod)),
  });
  const perDocumentCoverage = result.results.map((r) => ({ documentId: r.documentId, status: r.status, ...coreFields(r.understanding) }));
  const coverageCount = (key: keyof ReturnType<typeof coreFields>) => perDocumentCoverage.filter((d) => d[key]).length;

  const templateVariantKey = (u?: StructuredDocumentUnderstanding) => u ? `${u.pointOfSale.normalized ?? "?"}` : "NONE";
  const templateVariants = new Set(result.results.map((r) => templateVariantKey(r.understanding)));

  const aggregateSummary = {
    documentsDiscovered: discovered.length,
    documentsProcessed: result.documentsParsed,
    processingFailures: result.failures,
    exactDuplicates: result.duplicateFindings.filter((f) => f.kind === "EXACT_DOCUMENT_DUPLICATE").length,
    possibleDuplicates: result.duplicateFindings.filter((f) => f.kind === "POSSIBLE_BUSINESS_DUPLICATE").length,
    reviewRequired: result.reviewRequired,
    unsupported: result.unsupportedDocuments,
    coverage: { invoiceNumber: coverageCount("invoiceNumber"), issueDate: coverageCount("issueDate"), dueDate: coverageCount("dueDate"), nominalAmount: coverageCount("nominalAmount"), currency: coverageCount("currency"), provenance: coverageCount("provenance") },
    pointOfSaleSeriesVariantsObserved: templateVariants.size,
    identityClustersProposed: identityClusters.length,
    identityClustersByStatus: Object.fromEntries((["PROPOSED", "AMBIGUOUS", "CONTRADICTED", "UNKNOWN"] as const).map((s) => [s, identityClusters.filter((c) => c.status === s).length])),
    relationshipProposals: relationshipReport.proposals.length,
    relationshipContradictions: relationshipReport.proposals.filter((p) => p.status === "CONTRADICTED").length,
    relationshipReviewRequired: relationshipReport.proposals.filter((p) => p.reviewRequired).length,
    unmatchedRelationshipSignals: relationshipReport.unmatchedSignals.length,
    durablePersistence: persisted,
  };

  // Sanitized per-invoice review manifest (real extracted values) -- private boundary only, never committed.
  const reviewManifest = result.results.map((r, index) => {
    const u = r.understanding;
    return {
      privateSafeDocumentId: `client-zero-canary-${String(index + 1).padStart(2, "0")}`,
      status: r.status,
      invoiceNumberCandidate: u ? { raw: u.invoiceNumber.raw, normalized: u.invoiceNumber.normalized, confidence: u.invoiceNumber.confidence } : null,
      pointOfSaleCandidate: u ? { raw: u.pointOfSale.raw, normalized: u.pointOfSale.normalized } : null,
      issueDateCandidate: u ? u.dates.find((d) => d.semantic === "ISSUE_DATE") ?? null : null,
      dueDateCandidate: u ? u.dates.find((d) => d.semantic === "PAYMENT_DUE_DATE") ?? null : null,
      nominalAmountCandidate: u ? { raw: u.documentedNominalTotalCents.raw, normalized: u.documentedNominalTotalCents.normalized, confidence: u.documentedNominalTotalCents.confidence } : null,
      currencyCandidate: u ? { raw: u.currency.raw, normalized: u.currency.normalized } : null,
      customerEntityCandidate: u ? { taxId: u.customerTaxId.normalized, name: u.customerName.normalized, confidence: u.customerTaxId.confidence } : null,
      provenanceObservationCount: u?.observations.length ?? 0,
      reviewReasons: r.reviewReasons,
    };
  });

  await mkdir(PRIVATE_ANALYSIS_ROOT, { recursive: true, mode: 0o700 });
  const manifestPath = path.join(PRIVATE_ANALYSIS_ROOT, "phase-8b1-canary-review-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({ aggregateSummary, reviewManifest }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  console.log(JSON.stringify({ phase: "CANARY_PROCESSING_COMPLETE", aggregateSummary }));
  await prisma.$disconnect();
}

void main();
