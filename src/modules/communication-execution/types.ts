import type { CommunicationDraft, CommunicationDraftRequest, CommunicationPreparationInput, CommunicationSendPreparation, DraftApproval } from "@/modules/communication-preparation";

export type CommunicationExecutionStatus = "READY" | "ATTEMPTING" | "ACCEPTED" | "FAILED" | "UNKNOWN";
export type CommunicationOutcomeStatus = "ACCEPTED" | "FAILED" | "UNKNOWN";
export type CommunicationRetryEligibility = "NEVER" | "MANUAL_RETRY_ELIGIBLE" | "RECONCILIATION_REQUIRED";

export interface CommunicationExecution {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly draftId: string;
  readonly draftContentHash: string;
  readonly approvalId: string;
  readonly approvalActorId: string;
  readonly contactId: string;
  readonly channelId: string;
  readonly intent: string;
  readonly status: CommunicationExecutionStatus;
  readonly currentFingerprint: string;
  readonly idempotencyKey: string;
  readonly providerRequestKey: string;
  readonly invoiceIds: readonly string[];
  readonly targetOutstandingCents: number;
  readonly evidenceRefs: readonly string[];
  readonly revalidatedAt: string;
  readonly claimedAt?: string;
}

export interface CommunicationSendAttempt {
  readonly id: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly attemptNumber: number;
  readonly state: "ATTEMPTING";
  readonly providerId?: string;
  readonly providerRequestKey: string;
  readonly startedAt: string;
  readonly fingerprintAtAttempt: string;
  readonly evidenceRefs: readonly string[];
}

export interface CommunicationSendOutcome {
  readonly id: string;
  readonly organizationId: string;
  readonly attemptId: string;
  readonly status: CommunicationOutcomeStatus;
  readonly occurredAt: string;
  readonly reasonCode: string;
  readonly providerMessageId?: string;
}

export interface CommunicationExecutionSafetyState {
  readonly organizationId: string;
  readonly caseId: string;
  readonly version: string;
  readonly safetyFingerprint: string;
  readonly observedAt: string;
}

export interface CommunicationExecutionSafetySnapshot extends CommunicationExecutionSafetyState {
  readonly current: CommunicationPreparationInput;
}

export interface CommunicationExecutionStateLoader {
  load(input: { readonly organizationId: string; readonly caseId: string; readonly draftId: string; readonly approvalId: string }): Promise<CommunicationExecutionSafetySnapshot>;
}

export interface CommunicationExecutionClaimInput extends Omit<CommunicationExecution, "status" | "claimedAt"> {
  readonly claimedAt: string;
  readonly providerId?: string;
  readonly expectedSafetyVersion: string;
  readonly expectedSafetyFingerprint: string;
}

export type CommunicationExecutionClaimResult =
  | { readonly freshnessMatched: false; readonly claimed: false }
  | { readonly freshnessMatched: true; readonly claimed: boolean; readonly execution: CommunicationExecution; readonly attempt?: CommunicationSendAttempt };

export interface CommunicationExecutionStore {
  claim(input: CommunicationExecutionClaimInput): Promise<CommunicationExecutionClaimResult>;
  advanceSafetyState(input: Omit<CommunicationExecutionSafetyState, "version">): Promise<CommunicationExecutionSafetyState>;
  getSafetyState(organizationId: string, caseId: string): Promise<CommunicationExecutionSafetyState | undefined>;
  complete(executionId: string, attemptId: string, outcome: CommunicationSendOutcome): Promise<CommunicationExecution>;
  recoverUnknown(executionId: string, occurredAt: string): Promise<CommunicationExecution>;
  get(executionId: string): Promise<CommunicationExecution | undefined>;
  attempts(executionId: string): Promise<readonly CommunicationSendAttempt[]>;
  outcomes(executionId: string): Promise<readonly CommunicationSendOutcome[]>;
}

export interface CommunicationExecutionProviderRequest {
  readonly providerRequestKey: string;
  readonly draft: CommunicationDraft;
  readonly email: {
    readonly authorizedChannelId: string;
    readonly authorizedRecipient: string;
    readonly to: string;
    readonly subject: string;
    readonly body: string;
  };
}

export interface CommunicationExecutionProviderResult {
  readonly status: CommunicationOutcomeStatus;
  readonly reasonCode: string;
  readonly providerMessageId?: string;
}

export interface CommunicationExecutionProvider {
  readonly id: string;
  attempt(request: CommunicationExecutionProviderRequest): Promise<CommunicationExecutionProviderResult>;
}

export interface ExecuteCommunicationInput {
  readonly preparation: CommunicationSendPreparation;
  readonly draft: CommunicationDraft;
  readonly draftRequest: CommunicationDraftRequest;
  readonly approval: DraftApproval;
  readonly executionRequestedAt: string;
}

export type ExecuteCommunicationResult =
  | { readonly kind: "BLOCKED_BEFORE_ATTEMPT"; readonly blockers: readonly string[] }
  | { readonly kind: "SAFETY_STATE_CHANGED"; readonly blockers: readonly ["SAFETY_SNAPSHOT_CHANGED"] }
  | { readonly kind: "DUPLICATE_REQUEST"; readonly execution: CommunicationExecution; readonly retryEligibility: CommunicationRetryEligibility }
  | { readonly kind: "OUTCOME_RECORDED"; readonly execution: CommunicationExecution; readonly attempt: CommunicationSendAttempt; readonly outcome: CommunicationSendOutcome; readonly retryEligibility: CommunicationRetryEligibility };
