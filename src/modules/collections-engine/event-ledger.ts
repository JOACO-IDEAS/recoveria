import { deepFreeze } from "@/lib/domain/evidence";
import type { CollectionCase, CollectionEvent, HumanDecision } from "./types";

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

function decisionAuthorizesEvent(decision: HumanDecision, type: CollectionEvent["type"]): boolean {
  if (type === "CONTACT_DECISION_RECORDED") return decision.chosenAction === "CONTACT" || decision.chosenAction === "FOLLOW_UP";
  if (type === "WAIT_STARTED" || type === "WAIT_ENDED") return decision.chosenAction === "CONTACT" || decision.chosenAction === "FOLLOW_UP" || decision.chosenAction === "WAIT";
  if (type === "PROMISE_RECORDED") return decision.chosenAction === "RECORD_PROMISE";
  if (type === "PAYMENT_CLAIM_RECORDED") return decision.chosenAction === "VERIFY_PAYMENT";
  if (type === "PAYMENT_VERIFIED") return decision.chosenAction === "VERIFY_PAYMENT" && decision.operation === "CONFIRM_PAYMENT";
  if (type === "DISPUTE_OPENED") return decision.chosenAction === "REVIEW_DISPUTE" && decision.operation === "OPEN_DISPUTE";
  if (type === "DISPUTE_RESOLVED") return decision.chosenAction === "REVIEW_DISPUTE" && decision.operation === "RESOLVE_DISPUTE";
  if (type === "CASE_CLOSED") return decision.chosenAction === "CLOSE_CASE";
  return true;
}

export function appendCollectionEvent(
  collectionCase: CollectionCase,
  history: readonly CollectionEvent[],
  event: CollectionEvent,
  decisions: readonly HumanDecision[] = [],
): readonly CollectionEvent[] {
  if (event.organizationId !== collectionCase.organizationId || event.caseId !== collectionCase.id) {
    throw new Error("Cross-tenant or cross-case collection event rejected");
  }
  if (history.some(item => item.id === event.id)) throw new Error("Duplicate collection event rejected");
  let inheritsMateriality = false;
  let supersededEvent: CollectionEvent | undefined;
  if (event.relatedInvoiceId && !collectionCase.invoiceIds.includes(event.relatedInvoiceId)) {
    throw new Error("Collection event invoice is outside the case");
  }
  if (event.supersedesEventId) {
    const prior = history.find(item => item.id === event.supersedesEventId);
    if (!prior) throw new Error("Correction must reference an existing prior event");
    if (prior.organizationId !== event.organizationId || prior.caseId !== event.caseId) {
      throw new Error("Correction cannot supersede another tenant or case");
    }
    if (prior.relatedInvoiceId && prior.relatedInvoiceId !== event.relatedInvoiceId) {
      throw new Error("Correction must preserve the original invoice scope");
    }
    if (history.some(item => item.supersedesEventId === prior.id)) {
      throw new Error("Forked event supersession is not allowed; correct the effective event instead");
    }
    inheritsMateriality = HUMAN_DECISION_EVENTS.has(prior.type);
    supersededEvent = prior;
  }
  if (HUMAN_DECISION_EVENTS.has(event.type) || inheritsMateriality) {
    if (event.actor.kind !== "HUMAN" || !event.relatedDecisionId) {
      throw new Error("Material collection event requires an explicit human decision");
    }
    const matchingDecisions = decisions.filter(item => item.id === event.relatedDecisionId);
    if (matchingDecisions.length !== 1) throw new Error("Material collection event references no real human decision with a unique identity");
    const decision = matchingDecisions[0];
    if (decision.organizationId !== event.organizationId || decision.caseId !== event.caseId) {
      throw new Error("Human decision tenant or case does not match the collection event");
    }
    if (!decision.actorId || decision.actorId !== event.actor.id) {
      throw new Error("Collection event actor does not match its human decision");
    }
    if (!decisionAuthorizesEvent(decision, event.type)) {
      throw new Error("Human decision does not authorize this material event type");
    }
  }
  if (supersededEvent && supersededEvent.type !== event.type) {
    throw new Error("Correction event type is incompatible with the superseded event");
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
