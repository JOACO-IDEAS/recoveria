import type { CollectionCase, CollectionEvent, CollectionInvoice, ProjectionInput } from "@/modules/collections-engine";

export const ENGINE_ORG = "org-recoveria-synthetic";
export const ENGINE_AS_OF = "2026-09-11T12:00:00.000Z";
const evidence = (name: string) => [`fixture:5b1:${name}`];

export const caseOf = (id: string, invoiceIds: readonly string[]): CollectionCase => ({
  id,
  organizationId: ENGINE_ORG,
  buildingId: `building-${id}`,
  administrationId: `administration-${id}`,
  invoiceIds,
  currency: "ARS",
});

export const invoiceOf = (id: string, options: Partial<CollectionInvoice> = {}): CollectionInvoice => ({
  id,
  organizationId: ENGINE_ORG,
  outstandingCents: 100_000_00,
  daysOverdue: 45,
  disputed: false,
  evidenceRefs: evidence(id),
  ...options,
});

export const eventOf = (caseId: string, id: string, type: CollectionEvent["type"], options: Partial<CollectionEvent> = {}): CollectionEvent => ({
  id,
  organizationId: ENGINE_ORG,
  caseId,
  type,
  occurredAt: "2026-09-01T12:00:00.000Z",
  actor: { kind: "HUMAN", id: "operator-synthetic" },
  reason: "Synthetic 5B.1 truth",
  evidenceRefs: evidence(id),
  ...options,
});

export const inputOf = (id: string, options: Partial<ProjectionInput> = {}): ProjectionInput => {
  const invoices = options.invoices ?? [invoiceOf(`invoice-${id}`)];
  return {
    organizationId: ENGINE_ORG,
    asOf: ENGINE_AS_OF,
    case: caseOf(id, invoices.map(invoice => invoice.id)),
    invoices,
    events: [eventOf(id, `opened-${id}`, "CASE_OPENED")],
    contactAvailable: true,
    entityConfidence: "CONFIRMED",
    legalReviewThreshold: false,
    evidenceRefs: evidence(id),
    ...options,
  };
};

export const PHASE_5B1_SCENARIOS = {
  routine: inputOf("routine"),
  activePromise: inputOf("active-promise", { events: [eventOf("active-promise", "promise-active", "PROMISE_RECORDED", { data: { promisedFor: "2026-09-20" } })] }),
  brokenPromise: inputOf("broken-promise", { events: [eventOf("broken-promise", "promise-broken", "PROMISE_RECORDED", { data: { promisedFor: "2026-09-08" } })] }),
  paymentClaim: inputOf("payment-claim", { events: [eventOf("payment-claim", "claim-1", "PAYMENT_CLAIM_RECORDED", { relatedInvoiceId: "invoice-payment-claim" })] }),
  mixedDispute: inputOf("mixed-dispute", { invoices: [invoiceOf("invoice-disputed", { disputed: true }), invoiceOf("invoice-workable")] }),
  entityUncertain: inputOf("entity-uncertain", { entityConfidence: "AMBIGUOUS" }),
  missingContact: inputOf("missing-contact", { contactAvailable: false }),
  legalReview: inputOf("legal-review", { legalReviewThreshold: true }),
  zeroBalance: inputOf("zero-balance", { invoices: [invoiceOf("invoice-zero", { outstandingCents: 0, daysOverdue: 0 })] }),
} as const;
