import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaCommunicationExecutionStore } from "./prisma-store";
import type { CommunicationExecutionClaimInput } from "./types";

const testUrl = process.env.RECOVERIA_TEST_DATABASE_URL;
const explicitlyAllowlisted = process.env.RECOVERIA_TEST_DATABASE_ALLOWLIST === "recoveria-disposable-test";
const targetLooksDisposable = (() => {
  if (!testUrl) return false;
  try { const url = new URL(testUrl); return /recoveria/i.test(url.pathname) && /(test|disposable)/i.test(url.pathname); } catch { return false; }
})();
const authorized = Boolean(testUrl && explicitlyAllowlisted && targetLooksDisposable);

if (testUrl && !authorized) {
  describe("RecoverIA PostgreSQL integration target safety", () => {
    it("fails closed for configured but non-allowlisted targets", () => { throw new Error("RECOVERIA_TEST_DATABASE_URL is not an explicitly allowlisted disposable RecoverIA test target"); });
  });
}

describe.skipIf(!authorized)("RecoverIA PostgreSQL execution concurrency", () => {
  const organizationId = `org-recoveria-execution-test-${process.pid}`;
  const caseId = `case-recoveria-execution-test-${process.pid}`;
  let prisma: PrismaClient;
  let store: PrismaCommunicationExecutionStore;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl!, max: 6 }) });
    store = new PrismaCommunicationExecutionStore(prisma);
    await prisma.organization.create({ data: { id: organizationId, name: "RecoverIA disposable execution test" } });
    await prisma.collectionCase.create({ data: { id: caseId, organizationId, currency: "ARS", status: "OPEN", openedAt: new Date("2026-09-16T00:00:00.000Z") } });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  const claimInput = async (draftId: string): Promise<CommunicationExecutionClaimInput> => {
    const safety = await store.advanceSafetyState({ organizationId, caseId, safetyFingerprint: `fingerprint:${draftId}`, observedAt: "2026-09-16T12:00:00.000Z" });
    return { id: `execution:${draftId}`, organizationId, caseId, draftId, draftContentHash: `content:${draftId}`, approvalId: `approval:${draftId}`, approvalActorId: "reviewer", contactId: "contact-synthetic", channelId: "channel-synthetic", intent: "INITIAL_COLLECTION_CONTACT", currentFingerprint: safety.safetyFingerprint, idempotencyKey: `idempotency:${draftId}`, providerRequestKey: `provider:${draftId}`, invoiceIds: ["invoice-synthetic"], targetOutstandingCents: 100, evidenceRefs: ["evidence:synthetic"], revalidatedAt: safety.observedAt, claimedAt: "2026-09-16T12:00:01.000Z", providerId: "synthetic", expectedSafetyVersion: safety.version, expectedSafetyFingerprint: safety.safetyFingerprint };
  };

  it("allows exactly one concurrent first claim and persists one attempt", async () => {
    const input = await claimInput("draft-concurrent");
    const results = await Promise.all([store.claim(input), store.claim(input)]);
    expect(results.filter(result => result.freshnessMatched && result.claimed)).toHaveLength(1);
    expect(await prisma.communicationExecution.count({ where: { organizationId, draftId: input.draftId } })).toBe(1);
    const execution = await prisma.communicationExecution.findUniqueOrThrow({ where: { organizationId_draftId: { organizationId, draftId: input.draftId } } });
    expect(await prisma.communicationSendAttempt.count({ where: { executionId: execution.id } })).toBe(1);
  });

  it("rejects claim when the durable safety version changes", async () => {
    const input = await claimInput("draft-stale-safety");
    await store.advanceSafetyState({ organizationId, caseId, safetyFingerprint: "fingerprint:changed", observedAt: "2026-09-16T12:00:00.000Z" });
    expect(await store.claim(input)).toEqual({ freshnessMatched: false, claimed: false });
    expect(await prisma.communicationExecution.count({ where: { organizationId, draftId: input.draftId } })).toBe(0);
  });

  it("persists only one immutable outcome truth", async () => {
    const input = await claimInput("draft-outcome"); const claim = await store.claim(input);
    if (!claim.freshnessMatched || !claim.claimed || !claim.attempt) throw new Error("Expected winning claim");
    const accepted = { id: `${claim.attempt.id}:outcome`, organizationId, attemptId: claim.attempt.id, status: "ACCEPTED" as const, occurredAt: "2026-09-16T12:00:02.000Z", reasonCode: "SYNTHETIC_ACCEPTED" };
    await store.complete(claim.execution.id, claim.attempt.id, accepted);
    await expect(store.complete(claim.execution.id, claim.attempt.id, { ...accepted, status: "FAILED", reasonCode: "CONFLICT" })).rejects.toThrow(/Conflicting immutable/);
    expect(await prisma.communicationSendOutcome.count({ where: { attemptId: claim.attempt.id } })).toBe(1);
  });

  it("rolls back ATTEMPTING when attempt creation fails", async () => {
    const input = await claimInput("draft-rollback");
    await prisma.communicationExecution.create({ data: { id: input.id, organizationId, caseId, draftId: input.draftId, draftContentHash: input.draftContentHash, approvalId: input.approvalId, approvalActorId: input.approvalActorId, contactId: input.contactId, channelId: input.channelId, intent: input.intent, status: "READY", currentFingerprint: input.currentFingerprint, idempotencyKey: input.idempotencyKey, providerRequestKey: input.providerRequestKey, invoiceIds: [...input.invoiceIds], targetOutstandingCents: BigInt(input.targetOutstandingCents), evidenceRefs: [...input.evidenceRefs], revalidatedAt: new Date(input.revalidatedAt) } });
    await prisma.communicationSendAttempt.create({ data: { id: `${input.id}:attempt:1`, organizationId, executionId: input.id, attemptNumber: 99, state: "ATTEMPTING", providerRequestKey: input.providerRequestKey, startedAt: new Date(input.claimedAt), fingerprintAtAttempt: input.currentFingerprint, evidenceRefs: [] } });
    await expect(store.claim(input)).rejects.toBeTruthy();
    expect((await prisma.communicationExecution.findUniqueOrThrow({ where: { id: input.id } })).status).toBe("READY");
  });
});
