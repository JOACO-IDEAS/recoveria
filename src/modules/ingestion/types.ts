export type DocumentFormat = "PDF_NATIVE" | "PDF_SCANNED" | "CSV" | "XLSX" | "UNSUPPORTED" | "MALFORMED";
export type FieldStatus = "EXTRACTED" | "UNCERTAIN" | "AMBIGUOUS" | "MISSING" | "UNSUPPORTED" | "FAILED";
export type ParserStatus = "PARSED" | "REVIEW_REQUIRED" | "UNSUPPORTED" | "FAILED";
export type ExtractionConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
export type EvidenceClassification = "FACT" | "INFERENCE" | "UNKNOWN";
export type DateSemantic = "ISSUE_DATE" | "PAYMENT_DUE_DATE" | "SERVICE_PERIOD_START" | "SERVICE_PERIOD_END" | "FISCAL_AUTHORIZATION_EXPIRY" | "ISSUER_REGISTRATION_DATE" | "OTHER_DATE" | "UNKNOWN_DATE";

export interface ObservationRegion { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface DocumentObservation {
  readonly id: string;
  readonly documentId: string;
  readonly page: number;
  readonly observationType: "TEXT";
  readonly observedText: string;
  readonly region: ObservationRegion;
  readonly extractionMethod: "LOCAL_PDF_NATIVE" | "LOCAL_OCR";
  readonly parserVersion: string;
  readonly confidence: Exclude<ExtractionConfidence, "UNAVAILABLE">;
}

export interface ObservedCandidate<T = string> {
  readonly raw: string | null;
  readonly normalized: T | null;
  readonly status: FieldStatus;
  readonly confidence: ExtractionConfidence;
  readonly classification: EvidenceClassification;
  readonly observationIds: readonly string[];
}

export interface SemanticDateCandidate extends ObservedCandidate<string> { readonly semantic: DateSemantic }
export interface RelationshipCandidate {
  readonly kind: "POSSIBLE_INSTALLMENT_OF" | "POSSIBLE_STAGE_OF" | "POSSIBLE_PROJECT_GROUP";
  readonly status: "CANDIDATE";
  readonly confidence: "MEDIUM" | "LOW";
  readonly classification: "INFERENCE";
  readonly observationIds: readonly string[];
}

export interface StructuredDocumentUnderstanding {
  readonly providerId: string;
  readonly observations: readonly DocumentObservation[];
  readonly documentType: ObservedCandidate;
  readonly pointOfSale: ObservedCandidate;
  readonly invoiceNumber: ObservedCandidate;
  readonly dates: readonly SemanticDateCandidate[];
  readonly fiscalAuthorizationId: ObservedCandidate;
  readonly issuerTaxId: ObservedCandidate;
  readonly customerTaxId: ObservedCandidate;
  readonly issuerName: ObservedCandidate;
  readonly customerName: ObservedCandidate;
  readonly issuerAddress: ObservedCandidate;
  readonly customerAddress: ObservedCandidate;
  readonly currency: ObservedCandidate;
  readonly subtotalCents: ObservedCandidate<number>;
  readonly taxComponents: readonly ObservedCandidate<number>[];
  readonly documentedNominalTotalCents: ObservedCandidate<number>;
  readonly description: ObservedCandidate;
  readonly servicePeriodStart: ObservedCandidate<string>;
  readonly servicePeriodEnd: ObservedCandidate<string>;
  readonly quotationReference: ObservedCandidate;
  readonly installmentStage: ObservedCandidate;
  readonly relationshipCandidates: readonly RelationshipCandidate[];
}

export interface SourceEvidence {
  readonly documentId: string;
  readonly location: { readonly kind: "PDF_TEXT" | "CSV_CELL" | "SHEET_CELL"; readonly page?: number; readonly row?: number; readonly column?: string; readonly textSpan?: string; readonly region?: ObservationRegion; readonly extractionMethod?: DocumentObservation["extractionMethod"]; readonly parserVersion?: string };
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
  readonly understanding?: StructuredDocumentUnderstanding;
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
