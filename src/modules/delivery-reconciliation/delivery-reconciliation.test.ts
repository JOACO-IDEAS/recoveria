import { describe, expect, it } from "vitest";
import { InMemoryCommunicationDeliveryStore, ResendDeliveryWebhookService, deliveryProjection } from ".";
import { signResendWebhook } from "@/modules/email-provider";

const secret = `whsec_${Buffer.from("synthetic-webhook-secret").toString("base64")}`;
const correlation = { organizationId: "org-synthetic", executionId: "execution-synthetic", attemptId: "attempt-synthetic", providerId: "resend-email", providerMessageId: "message-synthetic" };
const body = (type = "email.delivered", messageId = correlation.providerMessageId, occurredAt = "2026-09-16T12:00:00.000Z") => JSON.stringify({ type, created_at: occurredAt, data: { email_id: messageId } });
const signed = (rawBody: string, eventId = "event-synthetic", signingSecret = secret) => ({ organizationId: correlation.organizationId, rawBody, eventId, timestamp: "1758024000", signature: `v1,${signResendWebhook(signingSecret, eventId, "1758024000", rawBody)}` });

const setup = () => { const store = new InMemoryCommunicationDeliveryStore(); store.addCorrelation(correlation); return { store, service: new ResendDeliveryWebhookService(store, secret) }; };

describe("Phase 5B.4C delivery reconciliation", () => {
  it("records a valid signed delivery event immutably and replays idempotently", async () => {
    const { store, service } = setup();
    expect((await service.ingest(signed(body()))).inserted).toBe(true);
    expect((await service.ingest(signed(body()))).inserted).toBe(false);
    expect(await store.events(correlation.executionId)).toMatchObject([{ status: "DELIVERED", providerMessageId: correlation.providerMessageId }]);
  });

  it.each([
    ["missing signature", (input: ReturnType<typeof signed>) => ({ ...input, signature: undefined })],
    ["wrong secret", (input: ReturnType<typeof signed>) => signed(input.rawBody, input.eventId, `whsec_${Buffer.from("wrong").toString("base64")}`)],
    ["tampered payload", (input: ReturnType<typeof signed>) => ({ ...input, rawBody: body("email.bounced") })],
  ])("rejects %s", async (_name, mutate) => { const { service } = setup(); await expect(service.ingest(mutate(signed(body())))).rejects.toThrow(/authenticity|signature/i); });

  it("rejects unknown provider identities and cross-tenant correlation", async () => {
    const { service } = setup();
    await expect(service.ingest(signed(body("email.delivered", "unknown")))).rejects.toThrow(/unknown|cross-tenant/i);
    await expect(service.ingest({ ...signed(body()), organizationId: "other-tenant" })).rejects.toThrow(/unknown|cross-tenant/i);
  });

  it("preserves bounce and contradictory delivery history without mutating other truth", async () => {
    const { store, service } = setup();
    await service.ingest(signed(body("email.delivered"), "event-delivered"));
    await service.ingest(signed(body("email.bounced", correlation.providerMessageId, "2026-09-16T12:01:00.000Z"), "event-bounced"));
    const events = await store.events(correlation.executionId);
    expect(events.map(event => event.status)).toEqual(["DELIVERED", "BOUNCED"]);
    expect(deliveryProjection(events)).toEqual({ status: "DELIVERY_UNKNOWN", requiresReview: true });
    expect(JSON.stringify(events)).not.toMatch(/balance|paid|promise|dispute/i);
  });

  it("rejects a replayed event identity with contradictory content", async () => {
    const { service } = setup();
    await service.ingest(signed(body("email.delivered")));
    await expect(service.ingest(signed(body("email.bounced")))).rejects.toThrow(/conflicting immutable/i);
  });
});
