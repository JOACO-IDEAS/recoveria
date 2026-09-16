import { Prisma, PrismaClient } from "@prisma/client";
import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationExecution, CommunicationExecutionClaimInput, CommunicationExecutionClaimResult, CommunicationExecutionSafetyState, CommunicationExecutionStore, CommunicationSendAttempt, CommunicationSendOutcome } from "./types";

type DbExecution = Awaited<ReturnType<PrismaClient["communicationExecution"]["findUniqueOrThrow"]>>;
type DbAttempt = Awaited<ReturnType<PrismaClient["communicationSendAttempt"]["findUniqueOrThrow"]>>;
type DbOutcome = Awaited<ReturnType<PrismaClient["communicationSendOutcome"]["findUniqueOrThrow"]>>;

const executionOf = (row: DbExecution): CommunicationExecution => deepFreeze({ id: row.id, organizationId: row.organizationId, caseId: row.caseId, draftId: row.draftId, draftContentHash: row.draftContentHash, approvalId: row.approvalId, approvalActorId: row.approvalActorId, contactId: row.contactId, channelId: row.channelId, intent: row.intent, status: row.status, currentFingerprint: row.currentFingerprint, idempotencyKey: row.idempotencyKey, providerRequestKey: row.providerRequestKey, invoiceIds: [...row.invoiceIds], targetOutstandingCents: Number(row.targetOutstandingCents), evidenceRefs: [...row.evidenceRefs], revalidatedAt: row.revalidatedAt.toISOString(), claimedAt: row.claimedAt?.toISOString() });
const attemptOf = (row: DbAttempt): CommunicationSendAttempt => deepFreeze({ id: row.id, organizationId: row.organizationId, executionId: row.executionId, attemptNumber: row.attemptNumber, state: row.state, providerId: row.providerId ?? undefined, providerRequestKey: row.providerRequestKey, startedAt: row.startedAt.toISOString(), fingerprintAtAttempt: row.fingerprintAtAttempt, evidenceRefs: [...row.evidenceRefs] });
const outcomeOf = (row: DbOutcome): CommunicationSendOutcome => deepFreeze({ id: row.id, organizationId: row.organizationId, attemptId: row.attemptId, status: row.status, occurredAt: row.occurredAt.toISOString(), reasonCode: row.reasonCode, ...(row.providerMessageId ? { providerMessageId: row.providerMessageId } : {}) });
const safetyOf = (row: { organizationId: string; caseId: string; version: bigint; safetyFingerprint: string; observedAt: Date }): CommunicationExecutionSafetyState => deepFreeze({ organizationId: row.organizationId, caseId: row.caseId, version: row.version.toString(), safetyFingerprint: row.safetyFingerprint, observedAt: row.observedAt.toISOString() });
const retryableTransactionConflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

/** Production adapter: uniqueness and claim ownership are enforced by PostgreSQL plus a serializable transaction/CAS. */
export class PrismaCommunicationExecutionStore implements CommunicationExecutionStore {
  constructor(private readonly client: PrismaClient) {}

  async claim(input: CommunicationExecutionClaimInput): Promise<CommunicationExecutionClaimResult> {
    for (let tryNumber = 1; tryNumber <= 3; tryNumber += 1) {
      try {
        return await this.client.$transaction(async transaction => {
          const safety = await transaction.communicationExecutionSafetyState.findUnique({ where: { organizationId_caseId: { organizationId: input.organizationId, caseId: input.caseId } } });
          if (!safety || safety.version.toString() !== input.expectedSafetyVersion || safety.safetyFingerprint !== input.expectedSafetyFingerprint) return deepFreeze({ freshnessMatched: false as const, claimed: false as const });
          const row = await transaction.communicationExecution.upsert({
            where: { organizationId_draftId: { organizationId: input.organizationId, draftId: input.draftId } },
            create: { id: input.id, organizationId: input.organizationId, caseId: input.caseId, draftId: input.draftId, draftContentHash: input.draftContentHash, approvalId: input.approvalId, approvalActorId: input.approvalActorId, contactId: input.contactId, channelId: input.channelId, intent: input.intent, status: "READY", currentFingerprint: input.currentFingerprint, idempotencyKey: input.idempotencyKey, providerRequestKey: input.providerRequestKey, invoiceIds: [...input.invoiceIds], targetOutstandingCents: BigInt(input.targetOutstandingCents), evidenceRefs: [...input.evidenceRefs], revalidatedAt: new Date(input.revalidatedAt) },
            update: {},
          });
          const claimed = await transaction.communicationExecution.updateMany({ where: { id: row.id, organizationId: input.organizationId, draftId: input.draftId, status: "READY" }, data: { status: "ATTEMPTING", claimedAt: new Date(input.claimedAt) } });
          if (claimed.count !== 1) return deepFreeze({ freshnessMatched: true as const, claimed: false, execution: executionOf(await transaction.communicationExecution.findUniqueOrThrow({ where: { id: row.id } })) });
          const attempt = await transaction.communicationSendAttempt.create({ data: { id: `${row.id}:attempt:1`, organizationId: input.organizationId, executionId: row.id, attemptNumber: 1, state: "ATTEMPTING", providerId: input.providerId, providerRequestKey: input.providerRequestKey, startedAt: new Date(input.claimedAt), fingerprintAtAttempt: input.currentFingerprint, evidenceRefs: [...input.evidenceRefs] } });
          const execution = await transaction.communicationExecution.findUniqueOrThrow({ where: { id: row.id } });
          return deepFreeze({ freshnessMatched: true as const, claimed: true, execution: executionOf(execution), attempt: attemptOf(attempt) });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!retryableTransactionConflict(error) || tryNumber === 3) throw error;
      }
    }
    throw new Error("Unreachable execution claim retry state");
  }

  async advanceSafetyState(input: Omit<CommunicationExecutionSafetyState, "version">): Promise<CommunicationExecutionSafetyState> {
    const id = `communication-safety:${input.organizationId}:${input.caseId}`;
    const row = await this.client.communicationExecutionSafetyState.upsert({ where: { organizationId_caseId: { organizationId: input.organizationId, caseId: input.caseId } }, create: { id, organizationId: input.organizationId, caseId: input.caseId, version: BigInt(1), safetyFingerprint: input.safetyFingerprint, observedAt: new Date(input.observedAt) }, update: { version: { increment: 1 }, safetyFingerprint: input.safetyFingerprint, observedAt: new Date(input.observedAt) } });
    return safetyOf(row);
  }

  async getSafetyState(organizationId: string, caseId: string) { const row = await this.client.communicationExecutionSafetyState.findUnique({ where: { organizationId_caseId: { organizationId, caseId } } }); return row ? safetyOf(row) : undefined; }

  async complete(executionId: string, attemptId: string, outcome: CommunicationSendOutcome): Promise<CommunicationExecution> {
    return this.client.$transaction(async transaction => {
      const attempt = await transaction.communicationSendAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      if (attempt.executionId !== executionId || attempt.organizationId !== outcome.organizationId || outcome.attemptId !== attemptId) throw new Error("Outcome scope mismatch");
      const prior = await transaction.communicationSendOutcome.findUnique({ where: { attemptId } });
      if (prior) {
        if (prior.status !== outcome.status || prior.reasonCode !== outcome.reasonCode || prior.occurredAt.toISOString() !== outcome.occurredAt || (prior.providerMessageId ?? undefined) !== outcome.providerMessageId) throw new Error("Conflicting immutable attempt outcome");
        return executionOf(await transaction.communicationExecution.findUniqueOrThrow({ where: { id: executionId } }));
      }
      await transaction.communicationSendOutcome.create({ data: { id: outcome.id, organizationId: outcome.organizationId, attemptId, status: outcome.status, occurredAt: new Date(outcome.occurredAt), reasonCode: outcome.reasonCode, providerMessageId: outcome.providerMessageId } });
      const updated = await transaction.communicationExecution.updateMany({ where: { id: executionId, organizationId: outcome.organizationId, status: "ATTEMPTING" }, data: { status: outcome.status } });
      if (updated.count !== 1) throw new Error("Execution is not awaiting an outcome");
      return executionOf(await transaction.communicationExecution.findUniqueOrThrow({ where: { id: executionId } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recoverUnknown(executionId: string, occurredAt: string): Promise<CommunicationExecution> {
    return this.client.$transaction(async transaction => {
      const execution = await transaction.communicationExecution.findUniqueOrThrow({ where: { id: executionId } });
      if (execution.status !== "ATTEMPTING") return executionOf(execution);
      const attempt = await transaction.communicationSendAttempt.findFirstOrThrow({ where: { executionId }, orderBy: { attemptNumber: "desc" } });
      await transaction.communicationSendOutcome.upsert({ where: { attemptId: attempt.id }, create: { id: `${attempt.id}:outcome`, organizationId: execution.organizationId, attemptId: attempt.id, status: "UNKNOWN", occurredAt: new Date(occurredAt), reasonCode: "PROCESS_INTERRUPTED_AFTER_ATTEMPT_CREATION" }, update: {} });
      await transaction.communicationExecution.updateMany({ where: { id: executionId, status: "ATTEMPTING" }, data: { status: "UNKNOWN" } });
      return executionOf(await transaction.communicationExecution.findUniqueOrThrow({ where: { id: executionId } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async get(executionId: string) { const row = await this.client.communicationExecution.findUnique({ where: { id: executionId } }); return row ? executionOf(row) : undefined; }
  async attempts(executionId: string) { return Promise.all((await this.client.communicationSendAttempt.findMany({ where: { executionId }, orderBy: { attemptNumber: "asc" } })).map(async row => attemptOf(row))); }
  async outcomes(executionId: string) { return Promise.all((await this.client.communicationSendOutcome.findMany({ where: { attempt: { executionId } }, orderBy: { occurredAt: "asc" } })).map(async row => outcomeOf(row))); }
}
