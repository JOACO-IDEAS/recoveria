import { deepFreeze } from "@/lib/domain/evidence";
import { revalidateCommunicationForSend } from "@/modules/communication-preparation";
import type { CommunicationExecution, CommunicationExecutionClaimInput, CommunicationOutcomeStatus, CommunicationRetryEligibility, CommunicationSendOutcome, ExecuteCommunicationInput, ExecuteCommunicationResult } from "./types";

const hash = (value: string) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); };
const executionId = (organizationId: string, draftId: string) => `communication-execution:${hash(JSON.stringify([organizationId, draftId]))}`;
export const providerRequestKeyFor = (organizationId: string, draftId: string) => `communication-provider:${hash(JSON.stringify([organizationId, draftId]))}`;
const draftContentHashFor = (draft: ExecuteCommunicationInput["draft"]) => hash(JSON.stringify({ subject: draft.subject, body: draft.body, channel: draft.channel, contactId: draft.contactId, channelId: draft.channelId, intent: draft.intent }));

export class CommunicationProviderAttemptError extends Error {
  constructor(message: string, readonly transmission: "NOT_STARTED" | "MAY_HAVE_STARTED") { super(message); }
}

export class SimulatedExecutionCrash extends Error {}

export function retryEligibilityFor(status: CommunicationExecution["status"]): CommunicationRetryEligibility {
  if (status === "FAILED") return "MANUAL_RETRY_ELIGIBLE";
  if (status === "UNKNOWN" || status === "ATTEMPTING") return "RECONCILIATION_REQUIRED";
  return "NEVER";
}

const outcomeFromError = (error: unknown): { status: CommunicationOutcomeStatus; reasonCode: string } => error instanceof CommunicationProviderAttemptError && error.transmission === "NOT_STARTED"
  ? { status: "FAILED", reasonCode: "FAILED_BEFORE_PROVIDER_ACCEPTANCE" }
  : { status: "UNKNOWN", reasonCode: "DELIVERY_OUTCOME_UNKNOWN" };
const safeProviderResult = (value: { readonly status: CommunicationOutcomeStatus; readonly reasonCode: string }): { status: CommunicationOutcomeStatus; reasonCode: string } => (["ACCEPTED", "FAILED", "UNKNOWN"] as const).includes(value.status) && Boolean(value.reasonCode)
  ? value
  : { status: "UNKNOWN", reasonCode: "INVALID_OR_AMBIGUOUS_PROVIDER_RESPONSE" };

export async function executeCommunicationBoundary(input: ExecuteCommunicationInput): Promise<ExecuteCommunicationResult> {
  const revalidation = revalidateCommunicationForSend({ preparation: input.preparation, draft: input.draft, draftRequest: input.draftRequest, approval: input.approval, current: input.current, asOf: input.asOf });
  if (!revalidation.authorization) return deepFreeze({ kind: "BLOCKED_BEFORE_ATTEMPT", blockers: [...revalidation.preparation.blockers] });
  const requestedTime = Date.parse(input.executionRequestedAt);
  const revalidatedTime = Date.parse(input.asOf);
  if (!input.executionRequestedAt || !Number.isFinite(requestedTime) || !Number.isFinite(revalidatedTime) || requestedTime < revalidatedTime) throw new Error("Execution requires a valid request time at or after revalidation");
  const authorization = revalidation.authorization;
  const claimInput: CommunicationExecutionClaimInput = {
    id: executionId(authorization.tenantId, authorization.draftId),
    organizationId: authorization.tenantId,
    caseId: authorization.caseId,
    draftId: authorization.draftId,
    draftContentHash: draftContentHashFor(input.draft),
    approvalId: authorization.approvalId,
    approvalActorId: input.approval.actor.id,
    contactId: authorization.contactId,
    channelId: authorization.channelId,
    intent: authorization.intent,
    currentFingerprint: authorization.currentFingerprint,
    idempotencyKey: authorization.idempotencyKey,
    providerRequestKey: providerRequestKeyFor(authorization.tenantId, authorization.draftId),
    invoiceIds: [...input.draftRequest.authorizedFacts.includedInvoiceIds],
    targetOutstandingCents: input.draftRequest.authorizedFacts.targetOutstandingCents,
    evidenceRefs: [...authorization.evidenceRefs],
    revalidatedAt: input.asOf,
    claimedAt: input.executionRequestedAt,
    providerId: input.provider.id,
  };
  const claim = await input.store.claim(claimInput);
  if (!claim.claimed || !claim.attempt) return deepFreeze({ kind: "DUPLICATE_REQUEST", execution: claim.execution, retryEligibility: retryEligibilityFor(claim.execution.status) });

  let providerResult: { status: CommunicationOutcomeStatus; reasonCode: string };
  try {
    providerResult = safeProviderResult(await input.provider.attempt({ providerRequestKey: claim.execution.providerRequestKey, draft: input.draft }));
  } catch (error) {
    if (error instanceof SimulatedExecutionCrash) throw error;
    providerResult = outcomeFromError(error);
  }
  const outcome: CommunicationSendOutcome = deepFreeze({ id: `${claim.attempt.id}:outcome`, organizationId: claim.execution.organizationId, attemptId: claim.attempt.id, status: providerResult.status, occurredAt: input.executionRequestedAt, reasonCode: providerResult.reasonCode });
  const execution = await input.store.complete(claim.execution.id, claim.attempt.id, outcome);
  return deepFreeze({ kind: "OUTCOME_RECORDED", execution, attempt: claim.attempt, outcome, retryEligibility: retryEligibilityFor(execution.status) });
}

export async function recoverInterruptedCommunicationExecution(store: ExecuteCommunicationInput["store"], executionIdValue: string, recoveredAt: string): Promise<CommunicationExecution> {
  if (!recoveredAt) throw new Error("Recovery requires an explicit time");
  return store.recoverUnknown(executionIdValue, recoveredAt);
}
