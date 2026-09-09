export type DocumentFormat = "PDF_NATIVE" | "PDF_SCANNED" | "CSV" | "XLSX" | "UNSUPPORTED" | "MALFORMED";
export type FieldStatus = "EXTRACTED" | "UNCERTAIN" | "AMBIGUOUS" | "MISSING" | "UNSUPPORTED" | "FAILED";
export type ParserStatus = "PARSED" | "REVIEW_REQUIRED" | "UNSUPPORTED" | "FAILED";

export interface SourceEvidence {
  readonly documentId: string;
  readonly location: { readonly kind: "PDF_TEXT" | "CSV_CELL" | "SHEET_CELL"; readonly page?: number; readonly row?: number; readonly column?: string; readonly textSpan?: string };
  readonly rawValue: string;
}

export interface ExtractedField<T = string> {
  readonly raw: string | null;
  readonly normalized: T | null;
  readonly status: FieldStatus;
  readonly evidence: readonly SourceEvidence[];
  readonly issues: readonly string[];
}

export interface DocumentInput {
  readonly id: string;
  readonly organizationId: string;
  readonly fileName: string;
  readonly declaredMediaType: string;
  readonly bytes: Uint8Array;
}

export interface Classification {
  readonly format: DocumentFormat;
  readonly evidence: readonly string[];
}

export interface EntityCandidateSignal {
  readonly raw: string;
  readonly normalized: string;
  readonly candidateIds: readonly string[];
  readonly status: "MISSING" | "CANDIDATE" | "AMBIGUOUS" | "NO_MATCH";
  readonly confirmedEntityId: null;
  readonly evidenceReferences: readonly SourceEvidence[];
}

export interface InvoiceCandidate {
  readonly documentId: string;
  readonly candidateIndex: number;
  readonly invoiceNumber: ExtractedField;
  readonly invoiceDate: ExtractedField<string>;
  readonly dueDate: ExtractedField<string>;
  readonly amountCents: ExtractedField<number>;
  readonly currency: ExtractedField;
  readonly issuer: ExtractedField;
  readonly billedParty: ExtractedField;
  readonly cuit: ExtractedField;
  readonly administration: ExtractedField;
  readonly building: ExtractedField;
  readonly address: ExtractedField;
  readonly description: ExtractedField;
  readonly administrationSignal: EntityCandidateSignal;
  readonly reviewReasons: readonly string[];
}

export interface DocumentParseResult {
  readonly documentId: string;
  readonly organizationId: string;
  readonly classification: Classification;
  readonly status: ParserStatus;
  readonly candidates: readonly InvoiceCandidate[];
  readonly reviewReasons: readonly string[];
  readonly errorCode?: string;
}

export interface DuplicateFinding {
  readonly documentId: string;
  readonly kind: "EXACT_DOCUMENT_DUPLICATE" | "POSSIBLE_BUSINESS_DUPLICATE";
  readonly matchesDocumentId: string;
  readonly evidence: readonly string[];
}

export interface ImportBatchResult {
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly documentsReceived: number;
  readonly documentsParsed: number;
  readonly invoiceCandidates: number;
  readonly reviewRequired: number;
  readonly duplicates: number;
  readonly unsupportedDocuments: number;
  readonly failures: number;
  readonly results: readonly DocumentParseResult[];
  readonly duplicateFindings: readonly DuplicateFinding[];
}
