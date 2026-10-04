// Phase 8B.2: shared types for the private ground-truth review workspace.
// This file is generic -- no real Client Zero data lives here. Real values
// only ever exist in the gitignored .private/client-zero/analysis/*.json
// files these types describe the shape of.

export const REVIEWABLE_FIELD_NAMES = ["invoiceNumber", "invoiceDate", "dueDate", "amountCents", "currency", "issuer", "billedParty", "cuit", "administration", "building", "address", "description"] as const;
export type ReviewableFieldName = (typeof REVIEWABLE_FIELD_NAMES)[number];

// Identity/role fields that must never be collapsed into a generic "entity" --
// each names a distinct real-world role (see knowledge/INVARIANTS.md).
export const IDENTITY_FIELD_NAMES = ["issuer", "billedParty", "administration", "building"] as const satisfies readonly ReviewableFieldName[];

export type FieldLabelStatus = "UNREVIEWED" | "CORRECT" | "INCORRECT" | "NOT_PRESENT_IN_DOCUMENT" | "UNCERTAIN";
export type DocumentReviewStatus = "UNREVIEWED" | "IN_PROGRESS" | "COMPLETE";

export interface FieldProposal {
  readonly raw: string | null;
  readonly normalized: unknown;
  readonly sourceLocation: unknown;
}

export interface DocumentProposal {
  readonly documentId: string;
  readonly privateSafeDocumentId: string;
  readonly importBatchId: string;
  readonly reviewReasons: readonly string[];
  readonly pdfFileName: string;
  readonly fields: Readonly<Record<ReviewableFieldName, FieldProposal>>;
}

export interface FieldLabel {
  readonly status: FieldLabelStatus;
  readonly correctedValue: string | null;
  readonly note: string | null;
}

export interface DocumentGroundTruth {
  readonly privateSafeDocumentId: string;
  readonly status: DocumentReviewStatus;
  readonly reviewer: string | null;
  readonly reviewedAt: string | null;
  readonly fields: Readonly<Record<ReviewableFieldName, FieldLabel>>;
}

export type GroundTruthStore = Readonly<Record<string, DocumentGroundTruth>>;
