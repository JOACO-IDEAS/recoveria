import { deepFreeze } from "@/lib/domain/evidence";
import { appendCollectionEvent } from "./event-ledger";
import type { CollectionCase, CollectionEvent, HumanDecision, NextAction, Recommendation } from "./types";

export interface RecordDecisionInput {
  readonly organizationId: string;
  readonly id: string;
  readonly actorId: string;
  readonly decidedAt: string;
  readonly chosenAction: NextAction;
  readonly reason?: string;
  readonly evidenceRefs?: readonly string[];
}

export function recordHumanDecision(recommendation: Recommendation, input: RecordDecisionInput): HumanDecision {
  if (recommendation.organizationId !== input.organizationId) throw new Error("Cross-tenant decision rejected");
  return deepFreeze({
    id: input.id,
    organizationId: input.organizationId,
    caseId: recommendation.caseId,
    recommendationId: recommendation.id,
    recommendedAction: recommendation.action,
    chosenAction: input.chosenAction,
    diverged: input.chosenAction !== recommendation.action,
    actorId: input.actorId,
    decidedAt: input.decidedAt,
    reason: input.reason,
    evidenceRefs: [...recommendation.evidenceRefs, ...(input.evidenceRefs ?? [])],
  });
}

export interface DecisionEventContext {
  readonly eventId: string;
  readonly waitEventId?: string;
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
  readonly relatedInvoiceId?: string;
  readonly promisedFor?: string;
}

/** The only 5B.1 write gate: an explicit human decision may append events. */
export function applyHumanDecision(
  collectionCase: CollectionCase,
  history: readonly CollectionEvent[],
  decision: HumanDecision,
  context: DecisionEventContext,
): readonly CollectionEvent[] {
  if (decision.organizationId !== collectionCase.organizationId || decision.caseId !== collectionCase.id) {
    throw new Error("Cross-tenant or cross-case decision rejected");
  }
  const base = {
    organizationId: decision.organizationId,
    caseId: decision.caseId,
    occurredAt: decision.decidedAt,
    actor: { kind: "HUMAN" as const, id: decision.actorId },
    reason: context.reason,
    evidenceRefs: [...decision.evidenceRefs, ...context.evidenceRefs],
    relatedDecisionId: decision.id,
    relatedInvoiceId: context.relatedInvoiceId,
  };
  if (decision.chosenAction === "CONTACT" || decision.chosenAction === "FOLLOW_UP") {
    const recorded = appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "CONTACT_DECISION_RECORDED", data: { action: decision.chosenAction } });
    return appendCollectionEvent(collectionCase, recorded, { ...base, id: context.waitEventId ?? `${context.eventId}:wait`, type: "WAIT_STARTED", data: { afterAction: decision.chosenAction } });
  }
  if (decision.chosenAction === "RECORD_PROMISE") {
    if (!context.promisedFor) throw new Error("A human-recorded promise requires promisedFor");
    return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "PROMISE_RECORDED", data: { promisedFor: context.promisedFor } });
  }
  if (decision.chosenAction === "CLOSE_CASE") {
    return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "CASE_CLOSED" });
  }
  return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "CASE_REVIEWED", data: { action: decision.chosenAction } });
}
