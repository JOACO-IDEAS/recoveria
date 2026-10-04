import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { DocumentInput, DocumentParseResult, DuplicateFinding, ImportBatchResult, InvoiceCandidate } from "../ingestion/types";

// Phase 8B.1: persists the in-memory ImportOrchestrator/CorpusProcessor
// output into durable CLIENT_ZERO_READ_ONLY storage, using the existing
// manual-import schema (ImportBatch -> SourceDocument -> ExtractionResult ->
// InvoiceImportCandidate/DuplicateFinding). This schema has no ConnectedSource
// relation at all, so it never requires pretending this local corpus is
// Google Drive -- it truthfully records a LOCAL_FOLDER-sourced manual import.

const FORMAT_TO_PROCESSING_STATUS = { PARSED: "PARSED", REVIEW_REQUIRED: "REVIEW_REQUIRED", UNSUPPORTED: "UNSUPPORTED", FAILED: "FAILED" } as const;
const FORMAT_TO_EXTRACTION_STATUS = { PARSED: "SUCCEEDED", REVIEW_REQUIRED: "PARTIAL", UNSUPPORTED: "FAILED", FAILED: "FAILED" } as const;
const FORMAT_TO_CANDIDATE_STATUS = { PARSED: "PARSED", REVIEW_REQUIRED: "REVIEW_REQUIRED" } as const;
const FIELD_STATUS_TO_CONFIRMATION_STATE = { EXTRACTED: "NORMALIZED", UNCERTAIN: "RAW", AMBIGUOUS: "RAW", MISSING: "RAW", UNSUPPORTED: "RAW", FAILED: "RAW" } as const;

const CANDIDATE_FIELD_NAMES = ["invoiceNumber", "invoiceDate", "dueDate", "amountCents", "currency", "issuer", "billedParty", "cuit", "administration", "building", "address", "description"] as const satisfies readonly (keyof InvoiceCandidate)[];

export interface CanaryDocumentMetadata {
  readonly documentId: string;
  readonly fileName: string;
  readonly declaredMediaType: string;
  readonly byteSize: number;
  readonly contentHash: string;
  readonly locator: string;
}

export interface PersistCanaryImportBatchInput {
  readonly organizationId: string;
  readonly importBatchLabel: string;
  readonly createdBy: string;
  readonly idempotencyKey: string;
  readonly result: ImportBatchResult;
  readonly documents: readonly CanaryDocumentMetadata[];
}

export interface PersistCanaryImportBatchOutput {
  readonly importBatchId: string;
  readonly sourceDocumentIds: Readonly<Record<string, string>>;
  readonly extractionResultCount: number;
  readonly extractedFieldCount: number;
  readonly candidateCount: number;
  readonly duplicateFindingCount: number;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fieldOf(candidate: InvoiceCandidate, name: (typeof CANDIDATE_FIELD_NAMES)[number]) {
  return candidate[name] as InvoiceCandidate["invoiceNumber"];
}

export async function persistCanaryImportBatch(prisma: PrismaClient, input: PersistCanaryImportBatchInput): Promise<PersistCanaryImportBatchOutput> {
  const { organizationId, result } = input;
  if (result.organizationId !== organizationId) throw new Error("CANARY_PERSIST_ORGANIZATION_MISMATCH");
  const metadataByDocumentId = new Map(input.documents.map((doc) => [doc.documentId, doc]));

  return prisma.$transaction(async (tx) => {
    // 20 documents x up to 12 fields each is dozens of sequential writes;
    // the default 5s interactive-transaction timeout is too short for a
    // one-time canary batch (not a hot path), so it is extended explicitly.
    const batch = await tx.importBatch.create({ data: { organizationId, label: input.importBatchLabel, status: "COMPLETED", idempotencyKey: input.idempotencyKey, createdBy: input.createdBy, completedAt: new Date() } });

    const sourceDocumentIds: Record<string, string> = {};
    let extractionResultCount = 0;
    let extractedFieldCount = 0;
    let candidateCount = 0;

    for (const documentResult of result.results) {
      const metadata = metadataByDocumentId.get(documentResult.documentId);
      if (!metadata) throw new Error(`CANARY_PERSIST_MISSING_METADATA:${documentResult.documentId}`);

      const sourceDocument = await tx.sourceDocument.create({
        data: {
          organizationId,
          importBatchId: batch.id,
          kind: "INVOICE",
          fileName: metadata.fileName,
          mediaType: metadata.declaredMediaType,
          contentHash: metadata.contentHash,
          storageKey: metadata.locator,
          byteSize: BigInt(metadata.byteSize),
          detectedFormat: documentResult.classification.format,
          processingStatus: FORMAT_TO_PROCESSING_STATUS[documentResult.status],
          reviewRequired: documentResult.status === "REVIEW_REQUIRED",
          processingErrorCode: documentResult.errorCode ?? null,
        },
      });
      sourceDocumentIds[documentResult.documentId] = sourceDocument.id;

      const understanding = documentResult.understanding;
      const extractionResult = await tx.extractionResult.create({
        data: {
          organizationId,
          sourceDocumentId: sourceDocument.id,
          status: FORMAT_TO_EXTRACTION_STATUS[documentResult.status],
          strategy: documentResult.classification.format,
          parserVersion: understanding?.providerId ?? "none",
          extractorVersion: understanding?.providerId ?? "none",
          startedAt: new Date(),
          completedAt: new Date(),
          warnings: documentResult.reviewReasons.length ? documentResult.reviewReasons : undefined,
        },
      });
      extractionResultCount += 1;

      for (const candidate of documentResult.candidates) {
        for (const name of CANDIDATE_FIELD_NAMES) {
          const field = fieldOf(candidate, name);
          const evidence = field.evidence[0];
          await tx.extractedField.create({
            data: {
              organizationId,
              extractionResultId: extractionResult.id,
              fieldName: name,
              rawValue: field.raw ?? "",
              normalizedValue: field.normalized === null || field.normalized === undefined ? undefined : (field.normalized as object | string | number),
              state: FIELD_STATUS_TO_CONFIRMATION_STATE[field.status],
              sourceLocation: evidence ? (JSON.parse(JSON.stringify(evidence.location)) as object) : { kind: "PDF_TEXT" },
            },
          });
          extractedFieldCount += 1;
        }

        const candidateStatus = FORMAT_TO_CANDIDATE_STATUS[documentResult.status as "PARSED" | "REVIEW_REQUIRED"];
        if (!candidateStatus) continue;
        await tx.invoiceImportCandidate.create({
          data: {
            organizationId,
            importBatchId: batch.id,
            sourceDocumentId: sourceDocument.id,
            extractionResultId: extractionResult.id,
            candidateIndex: candidate.candidateIndex,
            status: candidateStatus,
            reviewReasons: [...candidate.reviewReasons],
          },
        });
        candidateCount += 1;
      }
    }

    let duplicateFindingCount = 0;
    for (const finding of result.duplicateFindings as readonly DuplicateFinding[]) {
      const sourceId = sourceDocumentIds[finding.documentId];
      const matchesId = sourceDocumentIds[finding.matchesDocumentId];
      if (!sourceId || !matchesId) continue;
      await tx.duplicateFinding.create({
        data: { organizationId, importBatchId: batch.id, sourceDocumentId: sourceId, matchesDocumentId: matchesId, kind: finding.kind, evidence: [...finding.evidence] },
      });
      duplicateFindingCount += 1;
    }

    return { importBatchId: batch.id, sourceDocumentIds, extractionResultCount, extractedFieldCount, candidateCount, duplicateFindingCount };
  }, { timeout: 120_000, maxWait: 30_000 });
}

export function toDocumentInput(organizationId: string, documentId: string, fileName: string, bytes: Uint8Array): DocumentInput {
  return { id: documentId, organizationId, fileName, declaredMediaType: "application/pdf", bytes };
}

export type { DocumentParseResult };
