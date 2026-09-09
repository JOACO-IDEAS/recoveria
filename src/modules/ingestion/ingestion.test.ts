import { beforeAll, describe, expect, it } from "vitest";
import { buildInvoiceCandidate } from "./candidate-builder";
import { classifyDocument } from "./classifier";
import { ImportOrchestrator } from "./import-orchestrator";
import { calculatePhase2Metrics } from "./metrics";
import { normalizeCuit, normalizeDate, normalizeName, parseArgentineAmount } from "./normalization";
import type { ImportBatchResult } from "./types";
import { buildSyntheticDocumentCorpus, SYNTHETIC_ENTITY_CATALOG, type DocumentTruth } from "@/test/fixtures/document-corpus";

let batch: ImportBatchResult;
let truth: readonly DocumentTruth[];
let documents: Awaited<ReturnType<typeof buildSyntheticDocumentCorpus>>["documents"];

beforeAll(async () => {
  ({ documents, truth } = await buildSyntheticDocumentCorpus());
  batch = await new ImportOrchestrator().run("org-recoveria-synthetic", "phase-2-corpus-v1", documents, SYNTHETIC_ENTITY_CATALOG);
});

const result = (id: string) => {
  const found = batch.results.find(({ documentId }) => documentId === id);
  if (!found) throw new Error(`Missing result ${id}`);
  return found;
};

describe("classification and parser routing", () => {
  it("classifies the complete 40-document corpus exactly", () => {
    expect(documents).toHaveLength(40);
    expect(truth.every((item) => result(item.documentId).classification.format === item.expectedFormat)).toBe(true);
  });

  it("parses native PDF text with page/span evidence", () => {
    const candidate = result("pdf-1").candidates[0];
    expect(candidate.invoiceNumber.normalized).toBe("A-0001");
    expect(candidate.invoiceNumber.evidence[0].location).toEqual(expect.objectContaining({ kind: "PDF_TEXT", page: 1 }));
  });

  it("parses multiple CSV invoice rows with cell evidence", () => {
    const parsed = result("csv-29");
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[1].amountCents.normalized).toBe(23_456_789);
    expect(parsed.candidates[1].amountCents.evidence[0].location.kind).toBe("CSV_CELL");
  });

  it("parses multiple XLSX rows with sheet-cell evidence", () => {
    const parsed = result("xlsx-33");
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[0].invoiceNumber.evidence[0].location).toEqual(expect.objectContaining({ kind: "SHEET_CELL", row: 2 }));
  });

  it("routes scanned PDFs to the offline OCR boundary", () => {
    expect(result("pdf-25")).toEqual(expect.objectContaining({ status: "REVIEW_REQUIRED", candidates: [], reviewReasons: ["OCR_REQUIRED_OFFLINE_ADAPTER_NOT_IMPLEMENTED"] }));
  });

  it("marks unsupported and malformed documents without crashing the batch", () => {
    expect(result("doc-37").status).toBe("UNSUPPORTED");
    expect(result("doc-38").status).toBe("FAILED");
    expect(batch.invoiceCandidates).toBeGreaterThan(0);
  });
});

describe("normalization and uncertainty", () => {
  it("normalizes Argentine amounts without floating point storage", () => {
    expect(parseArgentineAmount("$ 1.234.567,89")).toBe(123_456_789);
    expect(parseArgentineAmount("234.567,89")).toBe(23_456_789);
  });

  it("normalizes CUIT formatting only when eleven digits exist", () => {
    expect(normalizeCuit("30-71234567-8")).toBe("30712345678");
    expect(normalizeCuit("30 71234567 8")).toBe("30712345678");
    expect(normalizeCuit("123")).toBeNull();
  });

  it("normalizes supported dates and rejects impossible dates", () => {
    expect(normalizeDate("15/07/2026")).toBe("2026-07-15");
    expect(normalizeDate("15-jul-2026")).toBe("2026-07-15");
    expect(normalizeDate("31/02/2026")).toBeNull();
  });

  it("normalizes abbreviations without confirming the entity", () => {
    const candidate = result("pdf-23").candidates[0];
    expect(candidate.administration.normalized).toBe(normalizeName("Administración García SRL"));
    expect(candidate.administrationSignal).toEqual(expect.objectContaining({ candidateIds: ["adm1"], status: "CANDIDATE", confirmedEntityId: null }));
  });

  it("preserves missing due dates as null and routes review", () => {
    const candidate = result("pdf-21").candidates[0];
    expect(candidate.dueDate).toEqual(expect.objectContaining({ raw: null, normalized: null, status: "MISSING" }));
    expect(result("pdf-21").status).toBe("REVIEW_REQUIRED");
  });

  it("keeps building-only evidence without inferring administration", () => {
    const candidate = result("pdf-22").candidates[0];
    expect(candidate.building.normalized).not.toBeNull();
    expect(candidate.administration.normalized).toBeNull();
    expect(candidate.administrationSignal.confirmedEntityId).toBeNull();
  });

  it("marks conflicting amount and ambiguous administration explicitly", () => {
    const candidate = result("pdf-24").candidates[0];
    expect(candidate.amountCents.status).toBe("AMBIGUOUS");
    expect(candidate.amountCents.normalized).toBeNull();
    expect(candidate.administrationSignal).toEqual(expect.objectContaining({ status: "AMBIGUOUS", candidateIds: ["adm4", "adm6"], confirmedEntityId: null }));
  });

  it("preserves the exact raw source beside normalization", () => {
    const candidate = result("pdf-23").candidates[0];
    expect(candidate.administration.raw).toBe("ADM. GARCIA S.R.L.");
    expect(candidate.administration.evidence[0].rawValue).toBe("ADM. GARCIA S.R.L.");
  });
});

describe("duplicates, tenancy, and batch isolation", () => {
  it("distinguishes exact document from possible business duplicates", () => {
    expect(batch.duplicateFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: "doc-39", kind: "EXACT_DOCUMENT_DUPLICATE", matchesDocumentId: "pdf-1" }),
      expect.objectContaining({ documentId: "doc-40", kind: "POSSIBLE_BUSINESS_DUPLICATE", matchesDocumentId: "pdf-2" }),
    ]));
  });

  it("is idempotent by tenant and import key", async () => {
    const orchestrator = new ImportOrchestrator();
    const first = await orchestrator.run("org-recoveria-synthetic", "same-key", documents, SYNTHETIC_ENTITY_CATALOG);
    const second = await orchestrator.run("org-recoveria-synthetic", "same-key", documents, SYNTHETIC_ENTITY_CATALOG);
    expect(second).toBe(first);
  });

  it("rejects mixed-tenant documents before processing", async () => {
    const foreign = { ...documents[0], organizationId: "foreign-tenant" };
    await expect(new ImportOrchestrator().run("org-recoveria-synthetic", "cross-tenant", [documents[0], foreign], SYNTHETIC_ENTITY_CATALOG)).rejects.toThrow("CROSS_TENANT_DOCUMENT_REJECTED");
  });

  it("isolates a document failure from successful siblings", () => {
    expect(batch.failures).toBe(1);
    expect(result("pdf-1").status).toBe("PARSED");
    expect(result("doc-38").status).toBe("FAILED");
  });

  it("does not invent a legal debtor from billed/admin/building fields", () => {
    const candidate = result("pdf-1").candidates[0];
    expect(candidate.billedParty.normalized).not.toBeNull();
    expect(candidate.administrationSignal.confirmedEntityId).toBeNull();
    expect(candidate).not.toHaveProperty("legalDebtorId");
  });
});

describe("Phase 2 measurable contract", () => {
  it("meets the truth-set metrics with zero false confirmations", () => {
    const metrics = calculatePhase2Metrics(batch, truth);
    expect(metrics.documentClassification.rate).toBe(1);
    expect(metrics.fields.invoiceNumber.rate).toBe(1);
    expect(metrics.fields.amountCents.rate).toBe(1);
    expect(metrics.fields.currency.rate).toBe(1);
    expect(metrics.fields.invoiceDate.rate).toBe(1);
    expect(metrics.fields.dueDate.rate).toBe(1);
    expect(metrics.fields.cuit.rate).toBe(1);
    expect(metrics.fields.administration.rate).toBe(1);
    expect(metrics.fields.building.rate).toBe(1);
    expect(metrics.duplicateDetection.rate).toBe(1);
    expect(metrics.reviewRecall.rate).toBe(1);
    expect(metrics.falseConfirmations).toBe(0);
    expect(metrics.parseSuccess).toEqual({ correct: 34, total: 40, rate: 0.85 });
  });

  it("builds a candidate from raw evidence without a catalog confirmation", () => {
    const candidate = buildInvoiceCandidate("unit", 0, { values: { invoiceNumber: "X" }, evidence: {} }, SYNTHETIC_ENTITY_CATALOG);
    expect(candidate.invoiceNumber.status).toBe("EXTRACTED");
    expect(candidate.administrationSignal.confirmedEntityId).toBeNull();
  });

  it("classifier ignores a misleading PDF extension without a PDF signature", () => {
    const classification = classifyDocument({ id: "fake", organizationId: "org", fileName: "fake.pdf", declaredMediaType: "application/pdf", bytes: new TextEncoder().encode("not a pdf") });
    expect(classification.format).toBe("UNSUPPORTED");
  });
});
