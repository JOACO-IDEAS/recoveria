import { deepFreeze } from "@/lib/domain/evidence";
import { communicationSnapshotFingerprint, evaluateCommunicationPreparation } from "./eligibility";
import { validateCommunicationDraft } from "./validator";
import type { CommunicationDraft, CommunicationDraftRequest, CommunicationPreparationInput, CommunicationSendBlocker, CommunicationSendPreparation, CommunicationSendRevalidationResult, DraftApproval } from "./types";

const unique = <T extends string>(values: readonly T[]) => [...new Set(values)].sort();
const same = (left: readonly unknown[], right: readonly unknown[]) => JSON.stringify(left) === JSON.stringify(right);
const hash = (value: string) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); };
const idempotencyKey = (tenantId: string, draftId: string, fingerprint: string) => `communication-send:${hash(JSON.stringify([tenantId, draftId, fingerprint]))}`;

function validateApprovalChain(draft: CommunicationDraft, request: CommunicationDraftRequest, approval: DraftApproval): void {
  if (approval.status !== "APPROVED" || !approval.actor || approval.actor.kind !== "HUMAN" || !approval.actor.id || !approval.decidedAt) throw new Error("Explicit HUMAN approval required for send preparation");
  const draftTime = Date.parse(draft.createdAt);
  const decisionTime = Date.parse(approval.decidedAt);
  if (!Number.isFinite(draftTime) || !Number.isFinite(decisionTime) || decisionTime < draftTime) throw new Error("Draft approval cannot predate draft creation");
  if (approval.draftId !== draft.id || draft.requestId !== request.id) throw new Error("Approval, draft, and request linkage mismatch");
  if (approval.organizationId !== draft.organizationId || request.organizationId !== draft.organizationId) throw new Error("Cross-tenant send approval rejected");
  if (request.caseId !== draft.caseId || request.authorizedFacts.caseId !== draft.caseId) throw new Error("Cross-case send approval rejected");
  if (request.authorizedFacts.organizationId !== draft.organizationId) throw new Error("Cross-tenant authorized facts rejected");
  if (request.contactId !== draft.contactId || request.channelId !== draft.channelId || request.intent !== draft.intent) throw new Error("Approved draft scope mismatch");
  if (!draft.requiresHumanApproval || draft.snapshotFingerprint !== request.snapshotFingerprint) throw new Error("Invalid approved draft snapshot");
  if (!validateCommunicationDraft(draft, request).valid) throw new Error("Unsafe approved communication draft rejected");
}

export function createCommunicationSendPreparation(input: {
  readonly id: string;
  readonly draft: CommunicationDraft;
  readonly draftRequest: CommunicationDraftRequest;
  readonly approval: DraftApproval;
  readonly requestedAt: string;
  readonly requestedBy: string;
}): CommunicationSendPreparation {
  validateApprovalChain(input.draft, input.draftRequest, input.approval);
  if (!input.id || !input.requestedAt || !input.requestedBy) throw new Error("Send preparation requires explicit identity, time, and requester");
  return deepFreeze({
    id: input.id,
    tenantId: input.draft.organizationId,
    caseId: input.draft.caseId,
    draftId: input.draft.id,
    approvalId: input.approval.id,
    contactId: input.draft.contactId,
    channelId: input.draft.channelId,
    intent: input.draft.intent,
    requestedAt: input.requestedAt,
    requestedBy: input.requestedBy,
    approvedSnapshotFingerprint: input.draft.snapshotFingerprint,
    state: "REVALIDATION_REQUIRED",
    blockers: [],
    evidenceRefs: unique([...input.draft.evidenceRefs, ...input.draftRequest.evidenceRefs]),
    idempotencyKey: idempotencyKey(input.draft.organizationId, input.draft.id, input.draft.snapshotFingerprint),
  });
}

const currentTargetInvoiceIds = (input: CommunicationPreparationInput, request: CommunicationDraftRequest): readonly string[] => {
  if (request.intent === "PAYMENT_VERIFICATION_REQUEST") return unique(input.interactionContext.pendingPaymentClaims.flatMap(claim => claim.invoiceIds));
  const excluded = new Set([
    ...input.interactionContext.pendingPaymentClaims.flatMap(claim => claim.invoiceIds),
    ...input.interactionContext.openDisputes.map(dispute => dispute.invoiceId),
    ...input.interactionContext.activePromises.flatMap(promise => promise.invoiceIds),
  ]);
  return input.projection.collectibleInvoiceIds.filter(id => !excluded.has(id));
};

export function revalidateCommunicationForSend(input: {
  readonly preparation: CommunicationSendPreparation;
  readonly draft: CommunicationDraft;
  readonly draftRequest: CommunicationDraftRequest;
  readonly approval: DraftApproval;
  readonly current: CommunicationPreparationInput;
  readonly asOf: string;
}): CommunicationSendRevalidationResult {
  validateApprovalChain(input.draft, input.draftRequest, input.approval);
  const { preparation, draft, draftRequest: request, current } = input;
  if (preparation.state !== "REVALIDATION_REQUIRED" || preparation.draftId !== draft.id || preparation.approvalId !== input.approval.id) throw new Error("Invalid send preparation linkage or state");
  if (!input.asOf || current.projection.asOf !== input.asOf || current.interactionContext.asOf !== input.asOf) throw new Error("Send revalidation requires one explicit consistent asOf");
  if (preparation.tenantId !== current.organizationId || draft.organizationId !== current.organizationId) throw new Error("Cross-tenant send revalidation rejected");
  if (preparation.caseId !== current.caseId || draft.caseId !== current.caseId) throw new Error("Cross-case send revalidation rejected");

  const initialEvaluation = evaluateCommunicationPreparation(current);
  const selectedEvaluation = initialEvaluation.outcome === "REVIEW_REQUIRED" && initialEvaluation.selectionRequirements.length
    ? evaluateCommunicationPreparation({ ...current, selectedContactId: draft.contactId, selectedChannelId: draft.channelId })
    : initialEvaluation;
  const currentFingerprint = communicationSnapshotFingerprint(current);
  const blockers: CommunicationSendBlocker[] = [];
  const approvedFacts = request.authorizedFacts;
  const targetIds = approvedFacts.includedInvoiceIds;
  const currentIds = currentTargetInvoiceIds(current, request);
  const currentInvoices = new Map(current.invoices.map(invoice => [invoice.id, invoice]));
  const readyContact = current.interactionContext.relevantContacts.readyContacts.find(candidate => candidate.contact.id === draft.contactId);
  const readyChannel = readyContact?.eligibleChannels.find(channel => channel.id === draft.channelId && (channel.type === "EMAIL" || channel.type === "WHATSAPP"));
  const stale = currentFingerprint !== preparation.approvedSnapshotFingerprint;

  if (stale) blockers.push("STALE_DRAFT");
  if (!readyContact) blockers.push("CONTACT_NO_LONGER_ELIGIBLE");
  if (!readyChannel) blockers.push("CHANNEL_NO_LONGER_ELIGIBLE");
  if (!same(currentIds, targetIds)) blockers.push("INVOICE_SCOPE_CHANGED");
  if (approvedFacts.invoiceFacts.some(invoice => currentInvoices.get(invoice.id)?.outstandingCents !== invoice.outstandingCents || currentInvoices.get(invoice.id)?.overdueCents !== invoice.overdueCents)) blockers.push("BALANCE_CHANGED");
  if (current.projection.outstandingCents === 0 || targetIds.some(id => currentInvoices.get(id)?.outstandingCents === 0)) blockers.push("ZERO_BALANCE");
  if (current.projection.recommendation.action !== approvedFacts.action || selectedEvaluation.intent !== request.intent) blockers.push("RECOMMENDATION_CHANGED");
  if (current.projection.conditions.some(condition => condition.condition === "ENTITY_UNCERTAIN")) blockers.push("ENTITY_AMBIGUITY");
  if (current.projection.conditions.some(condition => condition.condition === "LEGAL_REVIEW_THRESHOLD") || current.projection.recommendation.action === "PREPARE_LEGAL_REVIEW") blockers.push("LEGAL_REVIEW_REQUIRED");
  if (request.intent === "PAYMENT_VERIFICATION_REQUEST" && !current.allowPaymentVerificationRequest) blockers.push("POLICY_CHANGED");
  if (request.intent !== "PAYMENT_VERIFICATION_REQUEST" && current.interactionContext.pendingPaymentClaims.some(claim => claim.invoiceIds.some(id => targetIds.includes(id)))) blockers.push("PAYMENT_CLAIM_APPEARED");
  if (stale && [...current.interactionContext.verifiedPaymentClaims, ...current.interactionContext.rejectedPaymentClaims, ...current.interactionContext.supersededPaymentClaims].some(claim => claim.invoiceIds.some(id => targetIds.includes(id)))) blockers.push("PAYMENT_STATE_CHANGED");
  if (request.intent === "PAYMENT_VERIFICATION_REQUEST" && !current.interactionContext.pendingPaymentClaims.some(claim => claim.id === approvedFacts.relevantPaymentClaim?.id && claim.invoiceIds.some(id => targetIds.includes(id)))) blockers.push("PAYMENT_STATE_CHANGED");
  if (current.interactionContext.openDisputes.some(dispute => targetIds.includes(dispute.invoiceId))) blockers.push("DISPUTE_OPENED");
  if (stale && [...current.interactionContext.resolvedDisputes, ...current.interactionContext.supersededDisputes].some(dispute => targetIds.includes(dispute.invoiceId))) blockers.push("DISPUTE_OPENED");
  if (request.intent !== "PROMISE_FOLLOW_UP" && current.interactionContext.activePromises.some(promise => promise.invoiceIds.some(id => targetIds.includes(id)))) blockers.push("PROMISE_STATE_CHANGED");
  if (request.intent === "PROMISE_FOLLOW_UP" && !current.interactionContext.brokenPromises.some(promise => promise.id === approvedFacts.relevantPromise?.id && promise.invoiceIds.some(id => targetIds.includes(id)) && !promise.fulfillmentBlockers.length)) blockers.push("PROMISE_STATE_CHANGED");

  const currentFacts = selectedEvaluation.authorizedFacts;
  if (currentFacts && !same(currentFacts.evidenceRefs, approvedFacts.evidenceRefs)) blockers.push("EVIDENCE_CHANGED");
  if (selectedEvaluation.blockers.includes("MISSING_ACTION_EVIDENCE")) blockers.push("EVIDENCE_CHANGED");

  const finalBlockers = unique(blockers);
  const finalKey = idempotencyKey(preparation.tenantId, draft.id, currentFingerprint);
  const finalPreparation = deepFreeze({ ...preparation, currentSnapshotFingerprint: currentFingerprint, state: finalBlockers.length ? "BLOCKED_BEFORE_SEND" as const : "READY_TO_SEND" as const, blockers: finalBlockers, idempotencyKey: finalKey });
  if (finalBlockers.length) return deepFreeze({ preparation: finalPreparation });
  const authorization: NonNullable<CommunicationSendRevalidationResult["authorization"]> = deepFreeze({ id: `authorization:${finalKey}`, tenantId: preparation.tenantId, caseId: preparation.caseId, draftId: draft.id, approvalId: input.approval.id, contactId: draft.contactId, channelId: draft.channelId, intent: draft.intent, authorizedAt: input.asOf, asOf: input.asOf, currentFingerprint, idempotencyKey: finalKey, evidenceRefs: [...finalPreparation.evidenceRefs], state: "READY_TO_SEND" });
  return deepFreeze({ preparation: finalPreparation, authorization });
}
