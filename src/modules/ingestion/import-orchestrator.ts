import { buildInvoiceCandidate, type EntityCatalogEntry } from "./candidate-builder";
import { classifyDocument } from "./classifier";
import { DuplicateDetector } from "./duplicate-detector";
import { CsvInvoiceParser } from "./parsers/csv-invoice-parser";
import { PdfTextParser } from "./parsers/pdf-text-parser";
import { ScannedPdfAdapter } from "./parsers/scanned-pdf-adapter";
import { SpreadsheetInvoiceParser } from "./parsers/spreadsheet-invoice-parser";
import type { DocumentInput, DocumentParseResult, ImportBatchResult } from "./types";
import { validateInvoiceCandidate } from "./validation";

export class ImportOrchestrator {
  readonly #completed = new Map<string, ImportBatchResult>();

  async run(organizationId: string, idempotencyKey: string, documents: readonly DocumentInput[], catalog: readonly EntityCatalogEntry[]): Promise<ImportBatchResult> {
    const batchKey = `${organizationId}:${idempotencyKey}`;
    const prior = this.#completed.get(batchKey);
    if (prior) return prior;
    if (documents.some((document) => document.organizationId !== organizationId)) throw new Error("CROSS_TENANT_DOCUMENT_REJECTED");

    const duplicateDetector = new DuplicateDetector();
    const preliminary: DocumentParseResult[] = [];
    const allFindings = [];
    for (const document of documents) {
      const classification = classifyDocument(document);
      if (classification.format === "PDF_SCANNED") {
        preliminary.push(ScannedPdfAdapter.route(document, classification));
        allFindings.push(...duplicateDetector.inspect(document, []));
        continue;
      }
      if (classification.format === "UNSUPPORTED") {
        preliminary.push({ documentId: document.id, organizationId, classification, status: "UNSUPPORTED", candidates: [], reviewReasons: ["UNSUPPORTED_DOCUMENT"] });
        allFindings.push(...duplicateDetector.inspect(document, []));
        continue;
      }
      if (classification.format === "MALFORMED") {
        preliminary.push({ documentId: document.id, organizationId, classification, status: "FAILED", candidates: [], reviewReasons: ["MALFORMED_DOCUMENT"], errorCode: "MALFORMED_DOCUMENT" });
        allFindings.push(...duplicateDetector.inspect(document, []));
        continue;
      }
      try {
        const parser = classification.format === "PDF_NATIVE" ? PdfTextParser : classification.format === "CSV" ? CsvInvoiceParser : SpreadsheetInvoiceParser;
        const records = await parser.parse(document.id, document.bytes);
        const candidates = records.map((record, index) => buildInvoiceCandidate(document.id, index, record, catalog));
        const reviewReasons = [...new Set(candidates.flatMap(validateInvoiceCandidate))];
        preliminary.push({ documentId: document.id, organizationId, classification, status: reviewReasons.length ? "REVIEW_REQUIRED" : "PARSED", candidates, reviewReasons, ...(records[0]?.understanding ? { understanding: records[0].understanding } : {}) });
        allFindings.push(...duplicateDetector.inspect(document, candidates));
      } catch (error) {
        if (error instanceof Error && error.message === "PDF_NATIVE_TEXT_UNAVAILABLE") {
          const scanClassification = { format: "PDF_SCANNED" as const, evidence: [...classification.evidence, "Native decoding yielded no text; offline OCR review required"] };
          preliminary.push(ScannedPdfAdapter.route(document, scanClassification));
          allFindings.push(...duplicateDetector.inspect(document, []));
          continue;
        }
        preliminary.push({ documentId: document.id, organizationId, classification, status: "FAILED", candidates: [], reviewReasons: ["PARSER_FAILED"], errorCode: error instanceof Error ? error.message : "UNKNOWN_PARSE_ERROR" });
        allFindings.push(...duplicateDetector.inspect(document, []));
      }
    }
    const duplicateIds = new Set(allFindings.map(({ documentId }) => documentId));
    const results = preliminary.map((result) => duplicateIds.has(result.documentId)
      ? { ...result, status: "REVIEW_REQUIRED" as const, reviewReasons: [...new Set([...result.reviewReasons, "DUPLICATE_REQUIRES_REVIEW"])] }
      : result);
    const completed: ImportBatchResult = Object.freeze({
      organizationId, idempotencyKey,
      documentsReceived: documents.length,
      documentsParsed: results.filter(({ candidates }) => candidates.length > 0).length,
      invoiceCandidates: results.reduce((sum, { candidates }) => sum + candidates.length, 0),
      reviewRequired: results.filter(({ status }) => status === "REVIEW_REQUIRED").length,
      duplicates: duplicateIds.size,
      unsupportedDocuments: results.filter(({ status }) => status === "UNSUPPORTED").length,
      failures: results.filter(({ status }) => status === "FAILED").length,
      results: Object.freeze(results), duplicateFindings: Object.freeze(allFindings),
    });
    this.#completed.set(batchKey, completed);
    return completed;
  }
}
