import { createHash } from "node:crypto";
import { deepFreeze } from "@/lib/domain/evidence";
import { communicationSnapshotFingerprint, revalidateCommunicationForSend } from "@/modules/communication-preparation";
import type { CommunicationExecution, CommunicationExecutionClaimInput, CommunicationExecutionProvider, CommunicationExecutionProviderResult, CommunicationExecutionStateLoader, CommunicationExecutionStore, CommunicationOutcomeStatus, CommunicationRetryEligibility, CommunicationSendOutcome, ExecuteCommunicationInput, ExecuteCommunicationResult } from "./types";

const hash = (value: string) => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619); return (result >>> 0).toString(16).padStart(8, "0"); };
export const executionIdFor = (organizationId: string, draftId: string) => `communication-execution:${hash(JSON.stringify([organizationId, draftId]))}`;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const providerRequestKeyFor = (organizationId: string, draftId: string) => `communication-provider:${sha256(JSON.stringify([organizationId, draftId]))}`;
const draftContentHashFor = (draft: ExecuteCommunicationInput["draft"]) => sha256(JSON.stringify({ subject: draft.subject, body: draft.body, channel: draft.channel, contactId: draft.contactId, channelId: draft.channelId, intent: draft.intent }));

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
const safeProviderResult = (value: CommunicationExecutionProviderResult): CommunicationExecutionProviderResult => (["ACCEPTED", "FAILED", "UNKNOWN"] as const).includes(value.status) && Boolean(value.reasonCode) && (!value.providerMessageId || value.providerMessageId.length <= 200)
  ? value
  : { status: "UNKNOWN", reasonCode: "INVALID_OR_AMBIGUOUS_PROVIDER_RESPONSE" };

async function executeCommunicationBoundary(input: ExecuteCommunicationInput, store: CommunicationExecutionStore, stateLoader: CommunicationExecutionStateLoader, provider: CommunicationExecutionProvider): Promise<ExecuteCommunicationResult> {
  const snapshot = await stateLoader.load({ organizationId: input.draft.organizationId, caseId: input.draft.caseId, draftId: input.draft.id, approvalId: input.approval.id });
  if (snapshot.organizationId !== input.draft.organizationId || snapshot.caseId !== input.draft.caseId || snapshot.current.organizationId !== snapshot.organizationId || snapshot.current.caseId !== snapshot.caseId) throw new Error("Trusted execution state loader returned a tenant or case mismatch");
  if (snapshot.observedAt !== snapshot.current.projection.asOf || snapshot.observedAt !== snapshot.current.interactionContext.asOf || communicationSnapshotFingerprint(snapshot.current) !== snapshot.safetyFingerprint) throw new Error("Trusted execution safety snapshot is internally inconsistent");
  const revalidation = revalidateCommunicationForSend({ preparation: input.preparation, draft: input.draft, draftRequest: input.draftRequest, approval: input.approval, current: snapshot.current, asOf: snapshot.observedAt });
  if (!revalidation.authorization) return deepFreeze({ kind: "BLOCKED_BEFORE_ATTEMPT", blockers: [...revalidation.preparation.blockers] });
  const requestedTime = Date.parse(input.executionRequestedAt);
  const revalidatedTime = Date.parse(snapshot.observedAt);
  if (!input.executionRequestedAt || !Number.isFinite(requestedTime) || !Number.isFinite(revalidatedTime) || requestedTime < revalidatedTime) throw new Error("Execution requires a valid request time at or after revalidation");
  const authorization = revalidation.authorization;
  const authorizedChannel = snapshot.current.interactionContext.relevantContacts.readyContacts
    .find(candidate => candidate.contact.id === authorization.contactId)?.eligibleChannels
    .find(channel => channel.id === authorization.channelId && channel.type === "EMAIL");
  if (!authorizedChannel?.normalizedValue || input.draft.channel !== "EMAIL" || !input.draft.subject) return deepFreeze({ kind: "BLOCKED_BEFORE_ATTEMPT", blockers: ["AUTHORIZED_EMAIL_DESTINATION_UNAVAILABLE"] });
  if (input.draftRequest.authorizedFacts.channel.id !== authorizedChannel.id || input.draftRequest.authorizedFacts.channel.normalizedValue !== authorizedChannel.normalizedValue) return deepFreeze({ kind: "BLOCKED_BEFORE_ATTEMPT", blockers: ["AUTHORIZED_EMAIL_DESTINATION_MISMATCH"] });
  const claimInput: CommunicationExecutionClaimInput = {
    id: executionIdFor(authorization.tenantId, authorization.draftId),
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
    revalidatedAt: snapshot.observedAt,
    claimedAt: input.executionRequestedAt,
    providerId: provider.id,
    expectedSafetyVersion: snapshot.version,
    expectedSafetyFingerprint: snapshot.safetyFingerprint,
  };
  const claim = await store.claim(claimInput);
  if (!claim.freshnessMatched) return deepFreeze({ kind: "SAFETY_STATE_CHANGED", blockers: ["SAFETY_SNAPSHOT_CHANGED"] as const });
  if (!claim.claimed || !claim.attempt) return deepFreeze({ kind: "DUPLICATE_REQUEST", execution: claim.execution, retryEligibility: retryEligibilityFor(claim.execution.status) });

  let providerResult: CommunicationExecutionProviderResult;
  try {
    providerResult = safeProviderResult(await provider.attempt({ providerRequestKey: claim.execution.providerRequestKey, draft: input.draft, email: { authorizedChannelId: authorizedChannel.id, authorizedRecipient: authorizedChannel.normalizedValue, to: authorizedChannel.normalizedValue, subject: input.draft.subject, body: input.draft.body } }));
  } catch (error) {
    if (error instanceof SimulatedExecutionCrash) throw error;
    providerResult = outcomeFromError(error);
  }
  const outcome: CommunicationSendOutcome = deepFreeze({ id: `${claim.attempt.id}:outcome`, organizationId: claim.execution.organizationId, attemptId: claim.attempt.id, status: providerResult.status, occurredAt: input.executionRequestedAt, reasonCode: providerResult.reasonCode, ...(providerResult.providerMessageId ? { providerMessageId: providerResult.providerMessageId } : {}) });
  const execution = await store.complete(claim.execution.id, claim.attempt.id, outcome);
  return deepFreeze({ kind: "OUTCOME_RECORDED", execution, attempt: claim.attempt, outcome, retryEligibility: retryEligibilityFor(execution.status) });
}

export class CommunicationExecutionService {
  constructor(private readonly store: CommunicationExecutionStore, private readonly stateLoader: CommunicationExecutionStateLoader, private readonly provider: CommunicationExecutionProvider) {}
  execute(input: ExecuteCommunicationInput): Promise<ExecuteCommunicationResult> { return executeCommunicationBoundary(input, this.store, this.stateLoader, this.provider); }
}

export async function recoverInterruptedCommunicationExecution(store: CommunicationExecutionStore, executionIdValue: string, recoveredAt: string): Promise<CommunicationExecution> {
  if (!recoveredAt) throw new Error("Recovery requires an explicit time");
  return store.recoverUnknown(executionIdValue, recoveredAt);
}

export async function reconcileInterruptedCommunicationExecutions(store: CommunicationExecutionStore, executionIds: readonly string[], reconciledAt: string): Promise<readonly CommunicationExecution[]> {
  if (!executionIds.length || new Set(executionIds).size !== executionIds.length) throw new Error("Reconciliation requires unique explicitly selected execution IDs");
  const results: CommunicationExecution[] = [];
  for (const id of executionIds) results.push(await recoverInterruptedCommunicationExecution(store, id, reconciledAt));
  return deepFreeze(results);
}
