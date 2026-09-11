import { deepFreeze } from "@/lib/domain/evidence";
import { appendCollectionEvent, effectiveCollectionEvents } from "./event-ledger";
import { projectCollectionCase } from "./projection";
import type { CollectionEvent, HumanDecision, HumanDecisionOperation, NextAction, ProjectionInput, Recommendation } from "./types";

export interface RecordDecisionInput {
  readonly organizationId: string;
  readonly id: string;
  readonly actorId: string;
  readonly decidedAt: string;
  readonly chosenAction: NextAction;
  readonly operation?: HumanDecisionOperation;
  readonly reason?: string;
  readonly evidenceRefs?: readonly string[];
}

const recommendationFingerprint = (recommendation: Recommendation) => JSON.stringify({
  action: recommendation.action,
  reasons: recommendation.reasons,
  blockers: recommendation.blockers,
  evidenceRefs: recommendation.evidenceRefs,
  generatedAt: recommendation.generatedAt,
  policyVersion: recommendation.policyVersion,
});

export function recordHumanDecision(recommendation: Recommendation, input: RecordDecisionInput): HumanDecision {
  if (recommendation.organizationId !== input.organizationId) throw new Error("Cross-tenant decision rejected");
  if (!input.id || !input.actorId) throw new Error("Human decision requires a valid identity and actor");
  return deepFreeze({
    id: input.id,
    organizationId: input.organizationId,
    caseId: recommendation.caseId,
    recommendationId: recommendation.id,
    recommendationFingerprint: recommendationFingerprint(recommendation),
    recommendedAction: recommendation.action,
    chosenAction: input.chosenAction,
    operation: input.operation,
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
  readonly claimEventId?: string;
}

/** The only 5B.1 write gate: an explicit human decision may append events. */
export function applyHumanDecision(
  currentInput: ProjectionInput,
  decision: HumanDecision,
  context: DecisionEventContext,
): readonly CollectionEvent[] {
  const collectionCase = currentInput.case;
  const history = currentInput.events;
  if (decision.organizationId !== collectionCase.organizationId || decision.caseId !== collectionCase.id) {
    throw new Error("Cross-tenant or cross-case decision rejected");
  }
  const current = projectCollectionCase(currentInput);
  if (decision.recommendationId !== current.recommendation.id || decision.recommendedAction !== current.recommendation.action || decision.recommendationFingerprint !== recommendationFingerprint(current.recommendation)) {
    throw new Error("Stale decision rejected: the current case recommendation has changed");
  }
  const conditions = new Set(current.conditions.map(item => item.condition));
  const safeDivergence = decision.chosenAction === "REVIEW_CASE" || (decision.chosenAction === "RECORD_PROMISE" && ["WORKABLE", "WAITING_FOR_RESPONSE"].includes(current.workflowState));
  if (decision.chosenAction !== current.recommendation.action && !safeDivergence && !decision.operation) throw new Error("Incoherent decision rejected: chosen action is unsafe for the current projection");
  if (decision.chosenAction === "CLOSE_CASE" && current.workflowState !== "RESOLVED") throw new Error("Incoherent decision rejected: case is not resolved");
  if (decision.chosenAction === "RECORD_PROMISE" && !["WORKABLE", "WAITING_FOR_RESPONSE"].includes(current.workflowState)) throw new Error("Incoherent decision rejected: promise cannot be recorded in current state");
  if (decision.operation === "CONFIRM_PAYMENT" && (decision.chosenAction !== "VERIFY_PAYMENT" || !conditions.has("HAS_PAYMENT_TO_VERIFY"))) throw new Error("Incoherent payment confirmation decision rejected");
  if (decision.operation === "OPEN_DISPUTE" && decision.chosenAction !== "REVIEW_DISPUTE") throw new Error("Opening a dispute requires REVIEW_DISPUTE");
  if (decision.operation === "RESOLVE_DISPUTE" && (decision.chosenAction !== "REVIEW_DISPUTE" || !conditions.has("HAS_DISPUTED_INVOICE"))) throw new Error("Resolving a dispute requires an active dispute review");
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
    const recorded = appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "CONTACT_DECISION_RECORDED", data: { action: decision.chosenAction } }, [decision]);
    return appendCollectionEvent(collectionCase, recorded, { ...base, id: context.waitEventId ?? `${context.eventId}:wait`, type: "WAIT_STARTED", data: { afterAction: decision.chosenAction } }, [decision]);
  }
  if (decision.chosenAction === "RECORD_PROMISE") {
    if (!context.promisedFor) throw new Error("A human-recorded promise requires promisedFor");
    return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "PROMISE_RECORDED", data: { promisedFor: context.promisedFor } }, [decision]);
  }
  if (decision.operation === "CONFIRM_PAYMENT") {
    if (!context.claimEventId) throw new Error("Payment confirmation requires claimEventId");
    const claim = effectiveCollectionEvents(history).find(event => event.id === context.claimEventId && event.type === "PAYMENT_CLAIM_RECORDED");
    if (!claim) throw new Error("Payment confirmation requires a real effective payment claim");
    if (context.relatedInvoiceId && claim.relatedInvoiceId !== context.relatedInvoiceId) throw new Error("Payment confirmation must preserve claim invoice scope");
    return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "PAYMENT_VERIFIED", data: { claimEventId: context.claimEventId } }, [decision]);
  }
  if (decision.operation === "OPEN_DISPUTE") {
    if (!context.relatedInvoiceId) throw new Error("Opening a dispute requires relatedInvoiceId");
    return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "DISPUTE_OPENED" }, [decision]);
  }
  if (decision.operation === "RESOLVE_DISPUTE") {
    if (!context.relatedInvoiceId) throw new Error("Resolving a dispute requires relatedInvoiceId");
    const disputedInvoiceIds = current.conditions.find(item => item.condition === "HAS_DISPUTED_INVOICE")?.relatedInvoiceIds ?? [];
    if (!disputedInvoiceIds.includes(context.relatedInvoiceId)) throw new Error("Dispute resolution must target an actively disputed invoice");
    return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "DISPUTE_RESOLVED" }, [decision]);
  }
  if (decision.chosenAction === "CLOSE_CASE") {
    return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "CASE_CLOSED" }, [decision]);
  }
  return appendCollectionEvent(collectionCase, history, { ...base, id: context.eventId, type: "CASE_REVIEWED", data: { action: decision.chosenAction } });
}
