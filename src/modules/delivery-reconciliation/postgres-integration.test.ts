import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { PrismaCommunicationDeliveryStore, ResendDeliveryWebhookService, deliveryProjection } from ".";
import { signResendWebhook } from "@/modules/email-provider";

const testUrl = process.env.RECOVERIA_TEST_DATABASE_URL;
const explicitlyAllowlisted = process.env.RECOVERIA_TEST_DATABASE_ALLOWLIST === "recoveria-disposable-test";
const targetLooksDisposable = (() => { if (!testUrl) return false; try { const url = new URL(testUrl); return /recoveria/i.test(url.pathname) && /(test|disposable)/i.test(url.pathname); } catch { return false; } })();
const authorized = Boolean(testUrl && explicitlyAllowlisted && targetLooksDisposable);

if (testUrl && !authorized) describe("RecoverIA delivery PostgreSQL target safety", () => { it("fails closed for unsafe targets", () => { throw new Error("RECOVERIA_TEST_DATABASE_URL is not an explicitly allowlisted disposable RecoverIA test target"); }); });

describe.skipIf(!authorized)("RecoverIA PostgreSQL delivery reconciliation", () => {
  const suffix = `${process.pid}`;
  const organizationId = `org-recoveria-delivery-test-${suffix}`;
  const caseId = `case-recoveria-delivery-test-${suffix}`;
  const executionId = `execution-recoveria-delivery-test-${suffix}`;
  const attemptId = `attempt-recoveria-delivery-test-${suffix}`;
  const providerMessageId = `message-recoveria-delivery-test-${suffix}`;
  const secret = `whsec_${Buffer.from("synthetic-postgres-webhook-secret").toString("base64")}`;
  let prisma: PrismaClient;
  let store: PrismaCommunicationDeliveryStore;
  let service: ResendDeliveryWebhookService;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl!, max: 6 }) });
    store = new PrismaCommunicationDeliveryStore(prisma);
    service = new ResendDeliveryWebhookService(store, secret);
    await prisma.organization.create({ data: { id: organizationId, name: "RecoverIA disposable delivery test" } });
    await prisma.collectionCase.create({ data: { id: caseId, organizationId, currency: "ARS", status: "OPEN", openedAt: new Date("2026-09-16T00:00:00.000Z") } });
    await prisma.communicationExecution.create({ data: { id: executionId, organizationId, caseId, draftId: `draft-${suffix}`, draftContentHash: "synthetic", approvalId: "approval-synthetic", approvalActorId: "reviewer-synthetic", contactId: "contact-synthetic", channelId: "channel-synthetic", intent: "INITIAL_COLLECTION_CONTACT", status: "ACCEPTED", currentFingerprint: "fingerprint-synthetic", idempotencyKey: `idempotency-${suffix}`, providerRequestKey: `provider-request-${suffix}`, invoiceIds: ["invoice-synthetic"], targetOutstandingCents: BigInt(100), evidenceRefs: ["evidence-synthetic"], revalidatedAt: new Date("2026-09-16T12:00:00.000Z"), claimedAt: new Date("2026-09-16T12:00:01.000Z") } });
    await prisma.communicationSendAttempt.create({ data: { id: attemptId, organizationId, executionId, attemptNumber: 1, state: "ATTEMPTING", providerId: "resend-email", providerRequestKey: `provider-request-${suffix}`, startedAt: new Date("2026-09-16T12:00:01.000Z"), fingerprintAtAttempt: "fingerprint-synthetic", evidenceRefs: ["evidence-synthetic"] } });
    await prisma.communicationSendOutcome.create({ data: { id: `outcome-${suffix}`, organizationId, attemptId, status: "ACCEPTED", occurredAt: new Date("2026-09-16T12:00:02.000Z"), reasonCode: "PROVIDER_ACCEPTED", providerMessageId } });
  });

  afterAll(async () => { await prisma.organization.deleteMany({ where: { id: organizationId } }); await prisma.$disconnect(); });

  const raw = (type: string, time: string) => JSON.stringify({ type, created_at: time, data: { email_id: providerMessageId } });
  const signed = (eventId: string, body: string, tenant = organizationId) => ({ organizationId: tenant, rawBody: body, eventId, timestamp: "1758024000", signature: `v1,${signResendWebhook(secret, eventId, "1758024000", body)}` });

  it("persists DELIVERED and replays the same provider event idempotently", async () => {
    const input = signed(`event-delivered-${suffix}`, raw("email.delivered", "2026-09-16T12:10:00.000Z"));
    expect((await service.ingest(input)).inserted).toBe(true);
    expect((await service.ingest(input)).inserted).toBe(false);
  });

  it("preserves contradictory delivery evidence and projects reviewable uncertainty", async () => {
    await service.ingest(signed(`event-bounced-${suffix}`, raw("email.bounced", "2026-09-16T12:11:00.000Z")));
    const events = await store.events(executionId);
    expect(events.map(event => event.status)).toEqual(["DELIVERED", "BOUNCED"]);
    expect(deliveryProjection(events)).toEqual({ status: "DELIVERY_UNKNOWN", requiresReview: true });
  });

  it("rejects unknown and cross-tenant provider identity correlation", async () => {
    await expect(service.ingest(signed(`event-cross-${suffix}`, raw("email.delivered", "2026-09-16T12:12:00.000Z"), "other-tenant"))).rejects.toThrow(/unknown|cross-tenant/i);
    const unknownBody = JSON.stringify({ type: "email.delivered", created_at: "2026-09-16T12:12:00.000Z", data: { email_id: "unknown-message" } });
    await expect(service.ingest(signed(`event-unknown-${suffix}`, unknownBody))).rejects.toThrow(/unknown|cross-tenant/i);
  });

  it("converges concurrent identical delivery event inserts to one immutable row", async () => {
    const input = signed(`event-concurrent-${suffix}`, raw("email.delivered", "2026-09-16T12:13:00.000Z"));
    const results = await Promise.all([service.ingest(input), service.ingest(input)]);
    expect(results.filter(result => result.inserted)).toHaveLength(1);
    expect(await prisma.communicationDeliveryEvent.count({ where: { organizationId, providerEventId: input.eventId } })).toBe(1);
  });
});
