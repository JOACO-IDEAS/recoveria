import { resolveCollectionContacts } from "@/modules/contact-relationships";
import type { CanonicalPromise, CollectionInteraction, CollectionInteractionContextInput, ConfirmedPromisePayment, InvoiceDispute, PaymentClaim } from "@/modules/collection-interactions";
import type { CollectionCase, CollectionEvent } from "@/modules/collections-engine";
import { channelOf, contactContextOf, contactOf, relationshipOf } from "./phase-5b2a-contact-truth-set";

export const INTERACTION_ORG = "org-recoveria-synthetic";
export const INTERACTION_AS_OF = "2026-09-11T12:00:00.000Z";
const evidence = (id: string) => [`fixture:5b2b:${id}`];
export const interactionCaseOf = (invoiceIds: readonly string[] = ["invoice-a"], overrides: Partial<CollectionCase> = {}): CollectionCase => ({ id: "case-interactions", organizationId: INTERACTION_ORG, administrationId: "adm-a", buildingId: "building-a", invoiceIds, currency: "ARS", ...overrides });
export const interactionOf = (id: string, type: CollectionInteraction["type"], overrides: Partial<CollectionInteraction> = {}): CollectionInteraction => ({ id, organizationId: INTERACTION_ORG, caseId: "case-interactions", administrationId: "adm-a", type, contactId: "juan", channelId: "channel-juan", occurredAt: "2026-09-03T12:00:00.000Z", actor: { kind: "HUMAN", id: "operator" }, relatedInvoiceIds: ["invoice-a"], evidenceRefs: evidence(id), ...overrides });
export const promiseOf = (id: string, overrides: Partial<CanonicalPromise> = {}): CanonicalPromise => ({ id, organizationId: INTERACTION_ORG, caseId: "case-interactions", administrationId: "adm-a", contactId: "juan", amountCents: 800_000_00, promisedDate: "2026-09-20", invoiceIds: ["invoice-a"], recordedAt: "2026-09-04T12:00:00.000Z", confirmedBy: "operator", evidenceRefs: evidence(id), ...overrides });
export const promisePaymentOf = (promiseId: string, amountCents: number, overrides: Partial<ConfirmedPromisePayment> = {}): ConfirmedPromisePayment => ({ id: `financial-${promiseId}`, organizationId: INTERACTION_ORG, caseId: "case-interactions", promiseId, amountCents, confirmedAt: "2026-09-09T12:00:00.000Z", financialEvidenceRefs: evidence(`financial-${promiseId}`), ...overrides });
export const claimOf = (id: string, overrides: Partial<PaymentClaim> = {}): PaymentClaim => ({ id, organizationId: INTERACTION_ORG, caseId: "case-interactions", administrationId: "adm-a", contactId: "juan", invoiceIds: ["invoice-a"], claimedAmountCents: 400_000_00, claimedPaymentDate: "2026-09-08", recordedAt: "2026-09-09T12:00:00.000Z", confirmedBy: "operator", evidenceRefs: evidence(id), ...overrides });
export const disputeOf = (id: string, overrides: Partial<InvoiceDispute> = {}): InvoiceDispute => ({ id, organizationId: INTERACTION_ORG, caseId: "case-interactions", administrationId: "adm-a", invoiceId: "invoice-a", contactId: "juan", reason: "UNCLASSIFIED", status: "OPEN", occurredAt: "2026-09-05T12:00:00.000Z", confirmedBy: "operator", evidenceRefs: evidence(id), ...overrides });

export function interactionInput(overrides: Partial<CollectionInteractionContextInput> = {}): CollectionInteractionContextInput {
  const collectionCase = overrides.case ?? interactionCaseOf();
  const juan = contactOf("juan");
  const contactContext = contactContextOf({ buildingId: collectionCase.buildingId, administrationId: collectionCase.administrationId!, contacts: [juan], channels: [channelOf(juan.id, "channel-juan")], relationships: [relationshipOf(juan.id, "relationship-juan", { administrationId: collectionCase.administrationId! })] });
  const contactResolution = overrides.contactResolution ?? resolveCollectionContacts(collectionCase, contactContext);
  return { organizationId: INTERACTION_ORG, asOf: INTERACTION_AS_OF, case: collectionCase, collectionEvents: [], interactions: [], promises: [], confirmedPromisePayments: [], paymentClaims: [], disputes: [], contactResolution, ...overrides };
}

export const verifiedEvent = (claimId: string): CollectionEvent => ({ id: `verified-${claimId}`, organizationId: INTERACTION_ORG, caseId: "case-interactions", type: "PAYMENT_VERIFIED", occurredAt: "2026-09-10T12:00:00.000Z", actor: { kind: "HUMAN", id: "operator" }, reason: "Synthetic sanctioned verification", evidenceRefs: evidence(`verified-${claimId}`), relatedInvoiceId: "invoice-a", relatedDecisionId: "decision-confirm", data: { claimEventId: claimId } });
