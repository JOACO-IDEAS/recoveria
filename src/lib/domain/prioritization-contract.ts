export interface PrioritizationEvidenceReference {
  readonly kind: "INVOICE" | "LEDGER_ENTRY" | "COLLECTION_EVENT" | "PROMISE" | "CONTACT" | "RESOLUTION" | "LEGAL_REVIEW_FLAG";
  readonly id: string;
}

export interface PrioritizationInput {
  readonly caseId: string;
  readonly organizationId: string;
  readonly asOf: string;
  readonly currency: string;
  readonly daysOverdue: number;
  readonly outstandingCents: number;
  readonly unpaidInvoiceCount: number;
  readonly lastContactAt?: string;
  readonly contactAttemptCount: number;
  readonly promiseStatus?: "OPEN" | "KEPT" | "MISSED" | "CANCELLED";
  readonly disputeStatus: "NONE" | "DISPUTED";
  readonly contactAvailable: boolean;
  readonly entityConfidence: "CONFIRMED" | "AMBIGUOUS" | "MISSING";
  readonly legalReviewRecommended: boolean;
  readonly evidenceReferences: readonly PrioritizationEvidenceReference[];
}

export interface PrioritizationOutput {
  readonly recommendation: "REVIEW" | "HOLD" | "RESOLVE_DATA";
  readonly reasons: readonly { readonly code: string; readonly text: string; readonly evidenceReferences: readonly PrioritizationEvidenceReference[] }[];
  readonly blockers: readonly { readonly code: string; readonly text: string }[];
  readonly evidenceReferences: readonly PrioritizationEvidenceReference[];
  readonly policyVersion: string;
}
