import { describe, expect, it } from "vitest";
import type { CorpusSourceRecord } from "@/modules/ingestion/corpus-processor";
import type { SourceCheckpoint, SourceCheckpointEntry } from "@/modules/ingestion/incremental-corpus-processor";
import type { VersionedSourceCheckpoint } from "@/modules/ingestion/production-source-checkpoint-port";
import type { DocumentObservation, EvidenceClassification, ExtractionConfidence, FieldStatus, InvoiceCandidate, ObservedCandidate, StructuredDocumentUnderstanding } from "@/modules/ingestion/types";
import { ProductSurfaceQueryService, type ProductSurfaceCheckpointReader } from "./read-model";
import type { ProductSurfaceScope } from "./types";

const scope: ProductSurfaceScope = { organizationId: "org-synthetic", sourceType: "GOOGLE_DRIVE", sourceId: "source-synthetic", connectionId: "connection-synthetic" };

function candidate<T>(normalized: T | null, classification: EvidenceClassification, confidence: ExtractionConfidence, observationIds: readonly string[] = [], status: FieldStatus = normalized === null ? "MISSING" : "EXTRACTED"): ObservedCandidate<T> {
  return { raw: normalized === null ? null : String(normalized), normalized, status, confidence, classification, observationIds };
}

function invoiceCandidate(invoiceNumber: string, amountCents: number): InvoiceCandidate {
  const extracted = <T>(value: T) => ({ raw: String(value), normalized: value, status: "EXTRACTED" as const, evidence: [], issues: [] });
  const empty = extracted("");
  return {
    documentId: invoiceNumber,
    candidateIndex: 0,
    invoiceNumber: extracted(invoiceNumber),
    invoiceDate: extracted("2026-07-15"),
    dueDate: extracted("2026-08-15"),
    amountCents: extracted(amountCents),
    currency: extracted("ARS"),
    issuer: extracted("Proveedor Sintético"),
    billedParty: empty,
    cuit: empty,
    administration: empty,
    building: empty,
    address: empty,
    description: empty,
    administrationSignal: { raw: "", normalized: "", candidateIds: [], status: "NO_MATCH", confirmedEntityId: null, evidenceReferences: [] },
    reviewReasons: [],
  };
}

function understanding(documentId: string, overrides: Partial<StructuredDocumentUnderstanding> = {}): StructuredDocumentUnderstanding {
  const observations: DocumentObservation[] = [
    { id: `${documentId}-number`, documentId, page: 1, observationType: "TEXT", observedText: "Factura 0001-00000001", region: { x: 10, y: 20, width: 30, height: 5 }, extractionMethod: "LOCAL_PDF_NATIVE", parserVersion: "synthetic-parser-v1", confidence: "HIGH" },
    { id: `${documentId}-amount`, documentId, page: 2, observationType: "TEXT", observedText: "TOTAL $ 100.000", region: { x: 15, y: 70, width: 40, height: 5 }, extractionMethod: "LOCAL_PDF_NATIVE", parserVersion: "synthetic-parser-v1", confidence: "HIGH" },
  ];
  return {
    providerId: "synthetic-provider",
    observations,
    documentType: candidate("FACTURA", "FACT", "HIGH"),
    pointOfSale: candidate("0001", "FACT", "HIGH"),
    invoiceNumber: candidate("0001-00000001", "FACT", "HIGH", [`${documentId}-number`]),
    dates: [
      { ...candidate("2026-07-15", "FACT", "HIGH", [`${documentId}-number`]), semantic: "ISSUE_DATE" },
      { ...candidate<string>(null, "UNKNOWN", "UNAVAILABLE"), semantic: "PAYMENT_DUE_DATE" },
    ],
    fiscalAuthorizationId: candidate<string>(null, "UNKNOWN", "UNAVAILABLE"),
    issuerTaxId: candidate("30-70000000-1", "FACT", "HIGH"),
    customerTaxId: candidate("30-80000000-1", "FACT", "HIGH"),
    issuerName: candidate("Proveedor Sintético", "FACT", "HIGH"),
    customerName: candidate("Consorcio Candidato", "INFERENCE", "MEDIUM", [`${documentId}-number`], "UNCERTAIN"),
    issuerAddress: candidate<string>(null, "UNKNOWN", "UNAVAILABLE"),
    customerAddress: candidate("Calle Sintética 123", "FACT", "HIGH"),
    currency: candidate("ARS", "FACT", "HIGH"),
    subtotalCents: candidate<number>(null, "UNKNOWN", "UNAVAILABLE"),
    taxComponents: [],
    documentedNominalTotalCents: candidate(10_000_000, "FACT", "HIGH", [`${documentId}-amount`]),
    description: candidate<string>(null, "UNKNOWN", "UNAVAILABLE"),
    servicePeriodStart: candidate<string>(null, "UNKNOWN", "UNAVAILABLE"),
    servicePeriodEnd: candidate<string>(null, "UNKNOWN", "UNAVAILABLE"),
    quotationReference: candidate<string>(null, "UNKNOWN", "UNAVAILABLE"),
    installmentStage: candidate<string>(null, "UNKNOWN", "UNAVAILABLE"),
    relationshipCandidates: [],
    ...overrides,
  };
}

function entry(documentId: string, fingerprint = `fingerprint-${documentId}`, overrides: Partial<StructuredDocumentUnderstanding> = {}): SourceCheckpointEntry {
  const source: CorpusSourceRecord = {
    sourceDocumentId: documentId,
    displayName: `${documentId}.pdf`,
    mimeType: "application/pdf",
    size: 123,
    modifiedAt: "2026-09-26T12:00:00.000Z",
    fingerprintSha256: fingerprint,
    supported: true,
    provenance: { sourceType: scope.sourceType, sourceId: scope.sourceId, sourceDocumentId: documentId, locator: `private-root/${documentId}.pdf` },
  };
  return {
    source,
    parse: { documentId, organizationId: scope.organizationId, classification: { format: "PDF_NATIVE", evidence: [] }, status: "REVIEW_REQUIRED", candidates: [invoiceCandidate("0001-00000001", 10_000_000)], reviewReasons: ["SYNTHETIC_REVIEW"], understanding: understanding(documentId, overrides) },
    processingOutcome: "REVIEW_REQUIRED",
    processingVersion: "synthetic-v1",
    lastObservedRevision: "revision-1",
  };
}

function checkpoint(entries: readonly SourceCheckpointEntry[] = [entry("doc-a")]): SourceCheckpoint {
  return { schemaVersion: 1, organizationId: scope.organizationId, sourceType: scope.sourceType, sourceId: scope.sourceId, revision: "revision-1", entries };
}

class FakeReader implements ProductSurfaceCheckpointReader {
  calls = 0;
  constructor(readonly record: VersionedSourceCheckpoint | null) {}
  async load(): Promise<VersionedSourceCheckpoint | null> { this.calls += 1; return this.record; }
}

const record = (value = checkpoint()): VersionedSourceCheckpoint => ({ version: 1, connectionId: scope.connectionId, checkpoint: value });

describe("ProductSurfaceQueryService", () => {
  it("preserves FACT, INFERENCE, UNKNOWN, confidence and provenance without debt semantics", async () => {
    const service = new ProductSurfaceQueryService(new FakeReader(record()));
    const [invoice] = await service.listInvoices(scope);
    expect(invoice.invoiceNumber).toMatchObject({ classification: "FACT", confidence: "HIGH", evidenceAvailable: true });
    expect(invoice.entityCandidate).toMatchObject({ value: "Consorcio Candidato", classification: "INFERENCE", confidence: "MEDIUM" });
    expect(invoice.documentedDueDate).toMatchObject({ value: null, classification: "UNKNOWN", confidence: "UNAVAILABLE" });
    expect(invoice.documentedNominalTotalCents.value).toBe(10_000_000);
    expect(invoice.reviewStatus.required).toBe(true);
    expect(invoice.provenanceAvailable).toBe(true);
    const serialized = JSON.stringify(invoice);
    expect(serialized).not.toMatch(/outstanding|amountOwed|paid|unpaid|overdue|collectibility|prescription|legalStatus|administrationName/i);
    expect(serialized).not.toContain("private-root");
    expect(serialized).not.toContain(scope.sourceId);
  });

  it("returns field evidence linked to page and region while separating technical metadata", async () => {
    const service = new ProductSurfaceQueryService(new FakeReader(record()));
    const evidence = await service.getEvidence(scope, "doc-a", "documentedNominalTotalCents");
    expect(evidence).toMatchObject({ documentId: "doc-a", value: 10_000_000, classification: "FACT", confidence: "HIGH" });
    expect(evidence?.observations[0]).toMatchObject({ page: 2, excerpt: "TOTAL $ 100.000", region: { x: 15, y: 70, width: 40, height: 5 } });
    expect(evidence?.technical.parserVersions).toEqual(["synthetic-parser-v1"]);
  });

  it("reconstructs exact and possible duplicates and preserves review state", async () => {
    const exact = entry("doc-b", "fingerprint-doc-a");
    const possible = entry("doc-c", "fingerprint-doc-c");
    const service = new ProductSurfaceQueryService(new FakeReader(record(checkpoint([entry("doc-a"), exact, possible]))));
    const invoices = await service.listInvoices(scope);
    expect(invoices.map(({ documentId, duplicateStatus }) => [documentId, duplicateStatus])).toEqual([
      ["doc-a", "NONE"],
      ["doc-b", "EXACT_DOCUMENT_DUPLICATE"],
      ["doc-c", "POSSIBLE_BUSINESS_DUPLICATE"],
    ]);
    expect(invoices.every(({ reviewStatus }) => reviewStatus.required)).toBe(true);
  });

  it("rejects organization, source and connection boundary mismatches", async () => {
    const mismatches: VersionedSourceCheckpoint[] = [
      { ...record(), connectionId: "other-connection" },
      record({ ...checkpoint(), organizationId: "other-org" }),
      record({ ...checkpoint(), sourceId: "other-source" }),
    ];
    for (const mismatch of mismatches) await expect(new ProductSurfaceQueryService(new FakeReader(mismatch)).listInvoices(scope)).rejects.toThrow("PRODUCT_SURFACE_SCOPE_MISMATCH");
    const badEntry = entry("doc-a");
    const badCheckpoint = checkpoint([{ ...badEntry, parse: { ...badEntry.parse, organizationId: "other-org" } }]);
    await expect(new ProductSurfaceQueryService(new FakeReader(record(badCheckpoint))).listInvoices(scope)).rejects.toThrow("PRODUCT_SURFACE_ENTRY_SCOPE_MISMATCH");
  });

  it("supports only documentary filters and maps deterministically without provider calls", async () => {
    const reader = new FakeReader(record());
    const service = new ProductSurfaceQueryService(reader);
    const first = await service.listInvoices(scope, { search: "consorcio", reviewRequired: true, classification: "INFERENCE", documentedNominalTotalCentsMin: 9_000_000 });
    const second = await service.listInvoices(scope, { search: "consorcio", reviewRequired: true, classification: "INFERENCE", documentedNominalTotalCentsMin: 9_000_000 });
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(reader.calls).toBe(2);
  });

  it("keeps relationship density behind summary and advanced detail", async () => {
    const second = entry("doc-b", "different", { invoiceNumber: candidate("0001-00000002", "FACT", "HIGH", ["doc-b-number"]) });
    const service = new ProductSurfaceQueryService(new FakeReader(record(checkpoint([entry("doc-a"), second]))));
    const invoice = await service.getInvoice(scope, "doc-a");
    const relationships = await service.getRelationships(scope, "doc-a");
    expect(invoice?.relationships.proposalCount).toBeGreaterThan(0);
    expect(relationships?.proposals.length).toBe(invoice?.relationships.proposalCount);
    expect(relationships?.proposals.every(({ classification }) => classification === "INFERENCE")).toBe(true);
  });
});
