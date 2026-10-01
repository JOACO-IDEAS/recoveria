export type EvidenceClassification = "FACT" | "INFERENCE" | "UNKNOWN";
export type ExtractionConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
export type EvidenceField = "invoiceNumber" | "issueDate" | "documentedDueDate" | "documentedNominalTotalCents" | "currency" | "entityCandidate";

export interface ProductField<T> {
  readonly value: T | null;
  readonly status: string;
  readonly classification: EvidenceClassification;
  readonly confidence: ExtractionConfidence;
  readonly evidenceAvailable: boolean;
  readonly evidenceCount: number;
}

export interface ProductInvoice {
  readonly documentId: string;
  readonly source: { readonly sourceType: string; readonly displayName: string; readonly mimeType: string; readonly modifiedAt: string | null };
  readonly documentClassification: string;
  readonly parserStatus: string;
  readonly invoiceNumber: ProductField<string>;
  readonly issueDate: ProductField<string> & { readonly semantic: string };
  readonly documentedDueDate: ProductField<string> & { readonly semantic: string };
  readonly documentedNominalTotalCents: ProductField<number>;
  readonly currency: ProductField<string>;
  readonly entityCandidate: ProductField<string>;
  readonly duplicateStatus: "NONE" | "EXACT_DOCUMENT_DUPLICATE" | "POSSIBLE_BUSINESS_DUPLICATE";
  readonly reviewStatus: { readonly required: boolean; readonly reasonCount: number; readonly hasContradictions: boolean };
  readonly confidenceSummary: ExtractionConfidence;
  readonly classificationSummary: Readonly<Record<EvidenceClassification, number>>;
  readonly provenanceAvailable: boolean;
  readonly relationships: { readonly proposalCount: number; readonly reviewRequiredCount: number; readonly contradictionCount: number; readonly unmatchedSignalCount: number };
}

export interface ProductEvidence {
  readonly documentId: string;
  readonly source: { readonly sourceType: string; readonly displayName: string };
  readonly field: EvidenceField;
  readonly value: string | number | null;
  readonly status: string;
  readonly classification: EvidenceClassification;
  readonly confidence: ExtractionConfidence;
  readonly observations: readonly { readonly observationId: string; readonly page: number; readonly region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }; readonly excerpt: string; readonly extractionMethod: string; readonly confidence: Exclude<ExtractionConfidence, "UNAVAILABLE"> }[];
  readonly contradictions: readonly { readonly kind: string; readonly relatedDocumentId: string; readonly signals: readonly string[] }[];
  readonly technical: { readonly parserVersions: readonly string[] };
}

export interface ProductRelationships {
  readonly documentId: string;
  readonly summary: ProductInvoice["relationships"];
  readonly proposals: readonly { readonly kind: string; readonly status: string; readonly classification: EvidenceClassification; readonly confidence: ExtractionConfidence; readonly relatedDocumentId: string; readonly reviewRequired: boolean; readonly supportingSignals: readonly string[]; readonly contradictingSignals: readonly string[] }[];
  readonly unmatchedSignals: readonly { readonly kind: string; readonly reason: string }[];
}

export class ProductSurfaceApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export async function productSurfaceGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/product-surface/${path}`, { signal, cache: "no-store", headers: { accept: "application/json" } });
  const body = await response.json().catch(() => ({ error: "MALFORMED_RESPONSE" })) as { data?: T; error?: string };
  if (!response.ok || body.data === undefined) throw new ProductSurfaceApiError(response.status, body.error ?? "READ_FAILED");
  return body.data;
}

export function productSurfaceDocumentUrl(documentId: string): string {
  return `/api/product-surface/invoices/${encodeURIComponent(documentId)}/preview`;
}

export function documentaryMoney(cents: number | null, currency: string | null): string {
  if (cents === null) return "No identificado";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 0 }).format(cents / 100);
}

export const confidenceLabel: Readonly<Record<ExtractionConfidence, string>> = { HIGH: "Alta", MEDIUM: "Media", LOW: "Baja", UNAVAILABLE: "No disponible" };
export const classificationLabel: Readonly<Record<EvidenceClassification, string>> = { FACT: "Documentado", INFERENCE: "Propuesta", UNKNOWN: "No identificado" };
