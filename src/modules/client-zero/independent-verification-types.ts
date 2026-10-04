// Phase 8B.2A: independent verification is intentionally a separate evidence
// layer from pipeline proposals and founder ground truth. This module must not
// import either contract.

export const VERIFICATION_FIELD_NAMES = ["invoiceNumber", "issueDate", "documentedDueDate", "nominalAmount", "currency", "issuer", "billedCustomer", "administration", "building", "servicePeriod"] as const;
export type VerificationFieldName = (typeof VERIFICATION_FIELD_NAMES)[number];
export type ObservationStatus = "FOUND" | "NOT_FOUND" | "AMBIGUOUS";
export type ObservationConfidence = "HIGH" | "MEDIUM" | "LOW";
export type DocumentaryRole = "INVOICE_NUMBER" | "ISSUE_DATE" | "PAYMENT_DUE_DATE" | "NOMINAL_AMOUNT" | "CURRENCY" | "ISSUER" | "BILLED_CUSTOMER" | "ADMINISTRATION" | "BUILDING" | "SERVICE_PERIOD";

export interface BlindVerificationInput {
  readonly documentId: string;
  readonly pdfPath: string;
  readonly sha256: string;
}

export interface ObservationEvidence {
  readonly extractionMethod: "APPLE_VISION_OCR";
  readonly text: string | null;
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

export interface IndependentFieldObservation {
  readonly status: ObservationStatus;
  readonly normalizedValue: string | null;
  readonly rawObservedValue: string | null;
  readonly role: DocumentaryRole;
  readonly confidence: ObservationConfidence;
  readonly page: number | null;
  readonly evidence: ObservationEvidence;
}

export interface IndependentDocumentVerification {
  readonly documentId: string;
  readonly inputSha256: string;
  readonly pageCount: number;
  readonly verifier: { readonly provider: "APPLE_VISION_OCR"; readonly version: string };
  readonly observedAt: string;
  readonly fields: Readonly<Record<VerificationFieldName, IndependentFieldObservation>>;
}

export interface IndependentVerificationArtifact {
  readonly schemaVersion: 1;
  readonly verifierContractVersion: "phase-8b2a-v1";
  readonly documents: readonly IndependentDocumentVerification[];
}
