export type CaseWorkflowState = "REVIEW_REQUIRED" | "WORKABLE" | "WAITING_FOR_RESPONSE" | "RESOLVED";

export type CaseCondition =
  | "ENTITY_UNCERTAIN"
  | "MISSING_CONTACT"
  | "HAS_ACTIVE_PROMISE"
  | "HAS_BROKEN_PROMISE"
  | "HAS_DISPUTED_INVOICE"
  | "HAS_PAYMENT_TO_VERIFY"
  | "LEGAL_REVIEW_THRESHOLD";

export type NextAction =
  | "REVIEW_CASE"
  | "VERIFY_PAYMENT"
  | "CONTACT"
  | "FOLLOW_UP"
  | "WAIT"
  | "REQUEST_INFORMATION"
  | "REVIEW_DISPUTE"
  | "RECORD_PROMISE"
  | "PREPARE_LEGAL_REVIEW"
  | "CLOSE_CASE";

export type HumanDecisionOperation = "CONFIRM_PAYMENT" | "OPEN_DISPUTE" | "RESOLVE_DISPUTE";

export type CollectionEventType =
  | "CASE_OPENED"
  | "CASE_REVIEWED"
  | "CONTACT_DECISION_RECORDED"
  | "WAIT_STARTED"
  | "WAIT_ENDED"
  | "PROMISE_RECORDED"
  | "PAYMENT_CLAIM_RECORDED"
  | "PAYMENT_VERIFIED"
  | "DISPUTE_OPENED"
  | "DISPUTE_RESOLVED"
  | "CASE_CLOSED";

export interface CollectionCase {
  readonly id: string;
  readonly organizationId: string;
  readonly buildingId: string;
  readonly administrationId?: string;
  readonly invoiceIds: readonly string[];
  readonly currency: "ARS";
}

export interface CollectionInvoice {
  readonly id: string;
  readonly organizationId: string;
  readonly outstandingCents: number;
  readonly daysOverdue: number;
  readonly disputed: boolean;
  readonly evidenceRefs: readonly string[];
}

export interface CollectionEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly type: CollectionEventType;
  readonly occurredAt: string;
  readonly actor: { readonly kind: "HUMAN" | "SYSTEM" | "IMPORT"; readonly id: string };
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
  readonly relatedInvoiceId?: string;
  readonly relatedDecisionId?: string;
  readonly supersedesEventId?: string;
  readonly data?: Readonly<Record<string, string | number | boolean>>;
}

export interface ConditionExplanation {
  readonly condition: CaseCondition;
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
  readonly relatedInvoiceIds: readonly string[];
}

export interface RecommendationReason {
  readonly code: string;
  readonly text: string;
  readonly evidenceRefs: readonly string[];
}

export interface Recommendation {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly action: NextAction;
  readonly reasons: readonly RecommendationReason[];
  readonly blockers: readonly RecommendationReason[];
  readonly evidenceRefs: readonly string[];
  readonly generatedAt: string;
  readonly policyVersion: string;
}

export interface HumanDecision {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly recommendationId: string;
  readonly recommendationFingerprint: string;
  readonly recommendedAction: NextAction;
  readonly chosenAction: NextAction;
  readonly operation?: HumanDecisionOperation;
  readonly diverged: boolean;
  readonly actorId: string;
  readonly decidedAt: string;
  readonly reason?: string;
  readonly evidenceRefs: readonly string[];
}

export interface ProjectionInput {
  readonly organizationId: string;
  readonly asOf: string;
  readonly case: CollectionCase;
  readonly invoices: readonly CollectionInvoice[];
  readonly events: readonly CollectionEvent[];
  readonly contactAvailable: boolean;
  readonly entityConfidence: "CONFIRMED" | "AMBIGUOUS" | "MISSING";
  readonly legalReviewThreshold: boolean;
  readonly evidenceRefs: readonly string[];
}

export interface CaseProjection {
  readonly organizationId: string;
  readonly caseId: string;
  readonly asOf: string;
  readonly workflowState: CaseWorkflowState;
  readonly priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  readonly conditions: readonly ConditionExplanation[];
  readonly outstandingCents: number;
  readonly collectibleInvoiceIds: readonly string[];
  readonly excludedInvoiceIds: readonly string[];
  readonly recommendation: Recommendation;
  readonly evidenceRefs: readonly string[];
}
