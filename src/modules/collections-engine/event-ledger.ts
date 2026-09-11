import { deepFreeze } from "@/lib/domain/evidence";
import type { CollectionCase, CollectionEvent } from "./types";

const HUMAN_DECISION_EVENTS = new Set<CollectionEvent["type"]>([
  "CONTACT_DECISION_RECORDED",
  "WAIT_STARTED",
  "WAIT_ENDED",
  "PROMISE_RECORDED",
  "PAYMENT_CLAIM_RECORDED",
  "PAYMENT_VERIFIED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "CASE_CLOSED",
]);

export function appendCollectionEvent(
  collectionCase: CollectionCase,
  history: readonly CollectionEvent[],
  event: CollectionEvent,
): readonly CollectionEvent[] {
  if (event.organizationId !== collectionCase.organizationId || event.caseId !== collectionCase.id) {
    throw new Error("Cross-tenant or cross-case collection event rejected");
  }
  if (history.some(item => item.id === event.id)) throw new Error("Duplicate collection event rejected");
  if (HUMAN_DECISION_EVENTS.has(event.type) && (event.actor.kind !== "HUMAN" || !event.relatedDecisionId)) {
    throw new Error("Material collection event requires an explicit human decision");
  }
  if (event.relatedInvoiceId && !collectionCase.invoiceIds.includes(event.relatedInvoiceId)) {
    throw new Error("Collection event invoice is outside the case");
  }
  if (event.supersedesEventId) {
    const prior = history.find(item => item.id === event.supersedesEventId);
    if (!prior) throw new Error("Correction must reference an existing prior event");
    if (prior.organizationId !== event.organizationId || prior.caseId !== event.caseId) {
      throw new Error("Correction cannot supersede another tenant or case");
    }
  }
  const immutable = deepFreeze({
    ...event,
    actor: { ...event.actor },
    evidenceRefs: [...event.evidenceRefs],
    data: event.data ? { ...event.data } : undefined,
  }) as CollectionEvent;
  return Object.freeze([...history, immutable]);
}

export function effectiveCollectionEvents(history: readonly CollectionEvent[]): readonly CollectionEvent[] {
  const superseded = new Set(history.map(event => event.supersedesEventId).filter((id): id is string => Boolean(id)));
  return history.filter(event => !superseded.has(event.id));
}
