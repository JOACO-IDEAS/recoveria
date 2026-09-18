import { createHash } from "node:crypto";
import { readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeterministicDocumentUnderstandingProvider } from "../../src/modules/ingestion/document-understanding-provider";
import { proposeDocumentRelationships, type CohortDocument } from "../../src/modules/ingestion/document-relationships";
import type { StructuredDocumentUnderstanding } from "../../src/modules/ingestion/types";
import { proposeCustomerIdentityClusters, type CustomerIdentitySignal } from "../../src/modules/entity-resolution/cohort-clustering";

const repositoryRoot = path.resolve(process.cwd());
const privateRoot = path.join(repositoryRoot, ".private", "client-zero");
const authorizedInvoiceRoot = path.join(privateRoot, "invoices");
const authorizedAnalysisRoot = path.join(privateRoot, "analysis");

function within(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function extracted(value: { readonly normalized: unknown }): boolean { return value.normalized !== null; }
function date(understanding: StructuredDocumentUnderstanding | undefined, semantic: string): boolean {
  return understanding?.dates.some((item) => item.semantic === semantic && item.normalized !== null) ?? false;
}

async function main(): Promise<void> {
  const [inputArgument, outputArgument] = process.argv.slice(2);
  if (!inputArgument || !outputArgument) throw new Error("Usage: evaluate-local-pdfs <private-input-directory> <private-output-json>");
  const inputDirectory = await realpath(path.resolve(inputArgument));
  const outputPath = path.resolve(outputArgument);
  if (!within(inputDirectory, authorizedInvoiceRoot) || !within(outputPath, authorizedAnalysisRoot)) throw new Error("PRIVATE_EVALUATION_BOUNDARY_REJECTED");

  const names = (await readdir(inputDirectory)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  const organizationId = "private-local-evaluation-only";
  const documents = await Promise.all(names.map(async (name, index) => ({
  id: `private-doc-${String(index + 1).padStart(2, "0")}`,
  organizationId,
  fileName: name,
  declaredMediaType: "application/pdf",
  bytes: new Uint8Array(await readFile(path.join(inputDirectory, name))),
  })));
  const result = await new DeterministicDocumentUnderstandingProvider().understand({
  organizationId, idempotencyKey: "private-local-pdf-evaluation-v1", documents, entityCatalog: [],
  });
  const evaluations = result.results.map((item) => {
  const u = item.understanding;
  const core = {
    documentIdentity: Boolean(u && extracted(u.invoiceNumber) && extracted(u.pointOfSale)),
    issueDate: date(u, "ISSUE_DATE"),
    fiscalAuthorization: Boolean(u && extracted(u.fiscalAuthorizationId)),
    customerTaxId: Boolean(u && extracted(u.customerTaxId)),
    currency: Boolean(u && extracted(u.currency)),
    nominalTotal: Boolean(u && extracted(u.documentedNominalTotalCents)),
    paymentDueDate: date(u, "PAYMENT_DUE_DATE"),
    issuerRegistrationDate: date(u, "ISSUER_REGISTRATION_DATE"),
    servicePeriod: Boolean(u && extracted(u.servicePeriodStart) && extracted(u.servicePeriodEnd)),
    installmentOrStage: Boolean(u && extracted(u.installmentStage)),
    provenance: Boolean(u?.observations.length && u.observations.every((observation) => observation.page > 0 && observation.parserVersion && observation.extractionMethod)),
  };
  return {
    documentId: item.documentId,
    sourceSha256: createHash("sha256").update(documents.find(({ id }) => id === item.documentId)?.bytes ?? new Uint8Array()).digest("hex"),
    parserStatus: item.status,
    reviewReasons: item.reviewReasons,
    core,
    understanding: u,
  };
  });
  const count = (key: keyof (typeof evaluations)[number]["core"]) => evaluations.filter(({ core }) => core[key]).length;
  const summary = {
  documents: evaluations.length,
  fullCoreExtraction: evaluations.filter(({ core }) => core.documentIdentity && core.issueDate && core.fiscalAuthorization && core.customerTaxId && core.currency && core.nominalTotal && core.provenance).length,
  partialExtraction: evaluations.filter(({ core }) => [core.documentIdentity, core.issueDate, core.fiscalAuthorization, core.customerTaxId, core.currency, core.nominalTotal].some(Boolean) && !(core.documentIdentity && core.issueDate && core.fiscalAuthorization && core.customerTaxId && core.currency && core.nominalTotal)).length,
  failedExtraction: evaluations.filter(({ core }) => ![core.documentIdentity, core.issueDate, core.fiscalAuthorization, core.customerTaxId, core.currency, core.nominalTotal].some(Boolean)).length,
  coverage: {
    documentIdentity: count("documentIdentity"), issueDate: count("issueDate"), fiscalAuthorization: count("fiscalAuthorization"),
    customerTaxId: count("customerTaxId"), currency: count("currency"), nominalTotal: count("nominalTotal"),
    paymentDueDate: count("paymentDueDate"), issuerRegistrationDate: count("issuerRegistrationDate"),
    servicePeriod: count("servicePeriod"), installmentOrStage: count("installmentOrStage"), provenance: count("provenance"),
  },
  };

  // Phase 4.6B.1 — cohort-level identity clustering and document relationship
  // intelligence, run only in-memory against this private evaluation. All
  // proposals stay reviewable; nothing here merges documents or promotes a
  // cluster into an entity.
  const cohortDocuments: CohortDocument[] = result.results.flatMap((item) => item.understanding ? [{ documentId: item.documentId, understanding: item.understanding }] : []);
  const relationshipReport = proposeDocumentRelationships(cohortDocuments);
  const identitySignals: CustomerIdentitySignal[] = cohortDocuments.map(({ documentId, understanding }) => ({
    sourceRef: documentId,
    taxId: understanding.customerTaxId.normalized,
    normalizedName: understanding.customerName.normalized,
    normalizedAddress: understanding.customerAddress.normalized,
    evidence: understanding.customerTaxId.raw ? [{ documentId, location: { kind: "PDF_TEXT" as const }, rawValue: understanding.customerTaxId.raw }] : [],
  }));
  const identityClusters = proposeCustomerIdentityClusters(identitySignals);
  const relationshipSummary = {
    proposalsTotal: relationshipReport.proposals.length,
    byKind: Object.fromEntries([...new Set(relationshipReport.proposals.map((p) => p.kind))].map((kind) => [kind, relationshipReport.proposals.filter((p) => p.kind === kind).length])),
    highConfidence: relationshipReport.proposals.filter((p) => p.confidence === "HIGH").length,
    mediumConfidence: relationshipReport.proposals.filter((p) => p.confidence === "MEDIUM").length,
    ambiguous: relationshipReport.proposals.filter((p) => p.status === "AMBIGUOUS").length,
    contradictions: relationshipReport.proposals.filter((p) => p.status === "CONTRADICTED").length,
    reviewRequired: relationshipReport.proposals.filter((p) => p.reviewRequired).length,
    unmatchedSignals: relationshipReport.unmatchedSignals.length,
  };
  const identitySummary = {
    clustersProposed: identityClusters.length,
    byStatus: Object.fromEntries((["PROPOSED", "AMBIGUOUS", "CONTRADICTED", "UNKNOWN"] as const).map((status) => [status, identityClusters.filter((c) => c.status === status).length])),
    byConfidence: Object.fromEntries((["HIGH", "MEDIUM", "LOW"] as const).map((confidence) => [confidence, identityClusters.filter((c) => c.confidence === confidence).length])),
    reviewRequired: identityClusters.filter((c) => c.reviewRequired).length,
  };
  const extendedSummary = { ...summary, relationships: relationshipSummary, identityClusters: identitySummary };

  await writeFile(outputPath, `${JSON.stringify({ summary: extendedSummary, evaluations, relationshipReport, identityClusters }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`${JSON.stringify(extendedSummary)}\n`);
}

void main();
