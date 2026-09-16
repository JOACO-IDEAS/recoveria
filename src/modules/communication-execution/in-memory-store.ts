import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationExecution, CommunicationExecutionClaimInput, CommunicationExecutionClaimResult, CommunicationExecutionSafetyState, CommunicationExecutionStore, CommunicationSendAttempt, CommunicationSendOutcome } from "./types";

const snapshot = <T>(value: T): T => deepFreeze(structuredClone(value)) as T;

/** Deterministic test adapter only. Production durability requires PrismaCommunicationExecutionStore. */
export class InMemoryCommunicationExecutionStore implements CommunicationExecutionStore {
  private readonly executionById = new Map<string, CommunicationExecution>();
  private readonly executionIdByDraft = new Map<string, string>();
  private readonly attemptsByExecution = new Map<string, CommunicationSendAttempt[]>();
  private readonly outcomesByAttempt = new Map<string, CommunicationSendOutcome>();
  private readonly safetyByCase = new Map<string, CommunicationExecutionSafetyState>();
  private queue: Promise<void> = Promise.resolve();

  private exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  claim(input: CommunicationExecutionClaimInput): Promise<CommunicationExecutionClaimResult> {
    return this.exclusive(() => {
      const safety = this.safetyByCase.get(`${input.organizationId}\u0000${input.caseId}`);
      if (!safety || safety.version !== input.expectedSafetyVersion || safety.safetyFingerprint !== input.expectedSafetyFingerprint) return snapshot({ freshnessMatched: false, claimed: false });
      const draftKey = `${input.organizationId}\u0000${input.draftId}`;
      const existingId = this.executionIdByDraft.get(draftKey);
      if (existingId) return snapshot({ freshnessMatched: true, claimed: false, execution: this.executionById.get(existingId)! });
      const execution: CommunicationExecution = snapshot({ ...input, status: "ATTEMPTING", claimedAt: input.claimedAt });
      const attempt: CommunicationSendAttempt = snapshot({ id: `${input.id}:attempt:1`, organizationId: input.organizationId, executionId: input.id, attemptNumber: 1, state: "ATTEMPTING", providerId: input.providerId, providerRequestKey: input.providerRequestKey, startedAt: input.claimedAt, fingerprintAtAttempt: input.currentFingerprint, evidenceRefs: [...input.evidenceRefs] });
      this.executionById.set(input.id, execution);
      this.executionIdByDraft.set(draftKey, input.id);
      this.attemptsByExecution.set(input.id, [attempt]);
      return snapshot({ freshnessMatched: true, claimed: true, execution, attempt });
    });
  }

  advanceSafetyState(input: Omit<CommunicationExecutionSafetyState, "version">): Promise<CommunicationExecutionSafetyState> {
    return this.exclusive(() => {
      const key = `${input.organizationId}\u0000${input.caseId}`;
      const prior = this.safetyByCase.get(key);
      const state = snapshot({ ...input, version: String(BigInt(prior?.version ?? "0") + BigInt(1)) });
      this.safetyByCase.set(key, state);
      return snapshot(state);
    });
  }

  async getSafetyState(organizationId: string, caseId: string) { const value = this.safetyByCase.get(`${organizationId}\u0000${caseId}`); return value ? snapshot(value) : undefined; }

  complete(executionId: string, attemptId: string, outcome: CommunicationSendOutcome): Promise<CommunicationExecution> {
    return this.exclusive(() => {
      const current = this.executionById.get(executionId);
      if (!current) throw new Error("Execution not found");
      if (!this.attemptsByExecution.get(executionId)?.some(attempt => attempt.id === attemptId) || outcome.attemptId !== attemptId || outcome.organizationId !== current.organizationId) throw new Error("Outcome scope mismatch");
      const prior = this.outcomesByAttempt.get(attemptId);
      if (prior) {
        if (JSON.stringify(prior) !== JSON.stringify(outcome)) throw new Error("Conflicting immutable attempt outcome");
        return snapshot(current);
      }
      if (current.status !== "ATTEMPTING") throw new Error("Execution is not awaiting an outcome");
      const updated: CommunicationExecution = snapshot({ ...current, status: outcome.status });
      this.outcomesByAttempt.set(attemptId, snapshot(outcome));
      this.executionById.set(executionId, updated);
      return snapshot(updated);
    });
  }

  recoverUnknown(executionId: string, occurredAt: string): Promise<CommunicationExecution> {
    return this.exclusive(() => {
      const current = this.executionById.get(executionId);
      if (!current) throw new Error("Execution not found");
      if (current.status !== "ATTEMPTING") return snapshot(current);
      const attempt = this.attemptsByExecution.get(executionId)?.at(-1);
      if (!attempt) throw new Error("Attempting execution lacks an attempt record");
      const outcome: CommunicationSendOutcome = snapshot({ id: `${attempt.id}:outcome`, organizationId: current.organizationId, attemptId: attempt.id, status: "UNKNOWN", occurredAt, reasonCode: "PROCESS_INTERRUPTED_AFTER_ATTEMPT_CREATION" });
      this.outcomesByAttempt.set(attempt.id, outcome);
      const updated: CommunicationExecution = snapshot({ ...current, status: "UNKNOWN" });
      this.executionById.set(executionId, updated);
      return snapshot(updated);
    });
  }

  async get(executionId: string) { const value = this.executionById.get(executionId); return value ? snapshot(value) : undefined; }
  async attempts(executionId: string) { return snapshot(this.attemptsByExecution.get(executionId) ?? []); }
  async outcomes(executionId: string) { const attemptIds = new Set((this.attemptsByExecution.get(executionId) ?? []).map(item => item.id)); return snapshot([...this.outcomesByAttempt.values()].filter(item => attemptIds.has(item.attemptId))); }
}
