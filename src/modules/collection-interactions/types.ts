import type { CollectionContactResolution } from "@/modules/contact-relationships";
import type { CollectionCase, CollectionEvent, ProjectionInput } from "@/modules/collections-engine";

export type InteractionType = "CONTACT_ATTEMPTED" | "CONTACT_DELIVERED" | "RESPONSE_RECEIVED";
export interface CollectionInteraction {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly administrationId: string;
  readonly type: InteractionType;
  readonly contactId?: string;
  readonly channelId?: string;
  readonly occurredAt: string;
  readonly actor: { readonly kind: "HUMAN" | "SYSTEM" | "IMPORT"; readonly id: string };
  readonly relatedInvoiceIds: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface CanonicalPromise {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly administrationId: string;
  readonly contactId?: string;
  readonly amountCents: number;
  readonly promisedDate: string;
  readonly invoiceIds: readonly string[];
  readonly recordedAt: string;
  readonly confirmedBy: string;
  readonly evidenceRefs: readonly string[];
  readonly supersedesPromiseId?: string;
}

export interface ConfirmedPromisePayment {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly promiseId: string;
  readonly amountCents: number;
  readonly confirmedAt: string;
  readonly financialEvidenceRefs: readonly string[];
  /** Explicit deduplication link when this allocation represents the same payment as a verified claim. */
  readonly paymentClaimId?: string;
}

export interface PaymentClaim {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly administrationId: string;
  readonly contactId?: string;
  readonly invoiceIds: readonly string[];
  readonly claimedAmountCents?: number;
  readonly claimedPaymentDate?: string;
  readonly recordedAt: string;
  readonly confirmedBy: string;
  readonly evidenceRefs: readonly string[];
  readonly resolution?: "REJECTED";
  readonly supersedesClaimId?: string;
}

export type DisputeReason = "ALREADY_PAID" | "AMOUNT_QUESTIONED" | "INVOICE_INCORRECT" | "SERVICE_QUESTIONED" | "WRONG_RECIPIENT" | "OTHER" | "UNCLASSIFIED";
export interface InvoiceDispute {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly administrationId: string;
  readonly invoiceId: string;
  readonly contactId?: string;
  readonly reason: DisputeReason;
  readonly description?: string;
  readonly status: "OPEN" | "RESOLVED";
  readonly occurredAt: string;
  readonly confirmedBy: string;
  readonly evidenceRefs: readonly string[];
  readonly supersedesDisputeId?: string;
}

export interface DerivedPromise extends CanonicalPromise { readonly status: "ACTIVE" | "BROKEN" | "FULFILLED" | "SUPERSEDED"; readonly confirmedPaidCents: number; readonly fulfillmentEvidenceRefs: readonly string[]; readonly fulfillmentBlockers: readonly string[] }
export interface DerivedPaymentClaim extends PaymentClaim { readonly status: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED" | "SUPERSEDED" }
export interface DerivedDispute extends InvoiceDispute { readonly derivedStatus: "OPEN" | "RESOLVED" | "SUPERSEDED" }

export interface CollectionChronologyEntry {
  readonly id: string;
  readonly kind: CollectionEvent["type"] | InteractionType | "PROMISE" | "PROMISE_BROKEN" | "PAYMENT_CLAIM" | "DISPUTE";
  readonly occurredAt: string;
  readonly relatedInvoiceIds: readonly string[];
  readonly contactId?: string;
  readonly evidenceRefs: readonly string[];
}

export interface CollectionInteractionContextInput {
  readonly organizationId: string;
  readonly asOf: string;
  readonly case: CollectionCase;
  readonly collectionEvents: readonly CollectionEvent[];
  readonly interactions: readonly CollectionInteraction[];
  readonly promises: readonly CanonicalPromise[];
  readonly confirmedPromisePayments: readonly ConfirmedPromisePayment[];
  readonly paymentClaims: readonly PaymentClaim[];
  readonly disputes: readonly InvoiceDispute[];
  readonly contactResolution: CollectionContactResolution;
}

export interface CollectionInteractionContext {
  readonly organizationId: string;
  readonly caseId: string;
  readonly asOf: string;
  readonly lastContactAttempt?: CollectionInteraction;
  readonly lastDelivery?: CollectionInteraction;
  readonly lastResponse?: CollectionInteraction;
  readonly activePromises: readonly DerivedPromise[];
  readonly brokenPromises: readonly DerivedPromise[];
  readonly fulfilledPromises: readonly DerivedPromise[];
  readonly supersededPromises: readonly DerivedPromise[];
  readonly pendingPaymentClaims: readonly DerivedPaymentClaim[];
  readonly verifiedPaymentClaims: readonly DerivedPaymentClaim[];
  readonly rejectedPaymentClaims: readonly DerivedPaymentClaim[];
  readonly supersededPaymentClaims: readonly DerivedPaymentClaim[];
  readonly openDisputes: readonly DerivedDispute[];
  readonly resolvedDisputes: readonly DerivedDispute[];
  readonly supersededDisputes: readonly DerivedDispute[];
  readonly relevantContacts: CollectionContactResolution;
  readonly chronology: readonly CollectionChronologyEntry[];
  readonly blockers: readonly string[];
}

export interface InteractionProjectionBridgeInput {
  readonly projectionInput: Omit<ProjectionInput, "events" | "asOf">;
  readonly interactionContext: CollectionInteractionContext;
  readonly collectionEvents: readonly CollectionEvent[];
}
