import { createHash } from "node:crypto";
import { deepFreeze } from "@/lib/domain/evidence";
import { verifyResendWebhook } from "@/modules/email-provider";
import type { CommunicationDeliveryEvent, CommunicationDeliveryStatus, CommunicationDeliveryStore } from "./types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

interface ResendEventEnvelope { readonly type?: unknown; readonly created_at?: unknown; readonly data?: { readonly email_id?: unknown } }

const statusFor = (type: string): CommunicationDeliveryStatus => {
  if (type === "email.delivered") return "DELIVERED";
  if (type === "email.bounced") return "BOUNCED";
  return "DELIVERY_UNKNOWN";
};
const evidenceCodeFor = (type: string): string => type === "email.delivered" ? "RESEND_EMAIL_DELIVERED" : type === "email.bounced" ? "RESEND_EMAIL_BOUNCED" : "RESEND_DELIVERY_UNKNOWN";

export class ResendDeliveryWebhookService {
  constructor(private readonly store: CommunicationDeliveryStore, private readonly webhookSecret?: string) {}

  async ingest(input: { readonly organizationId: string; readonly rawBody: string; readonly eventId?: string; readonly timestamp?: string; readonly signature?: string }): Promise<{ readonly inserted: boolean; readonly event: CommunicationDeliveryEvent }> {
    if (input.rawBody.length > 65_536 || (input.eventId?.length ?? 0) > 200) throw new Error("Webhook payload or identity exceeds bounded limits");
    verifyResendWebhook({ secret: this.webhookSecret, eventId: input.eventId, timestamp: input.timestamp, signature: input.signature, rawBody: input.rawBody });
    let parsed: ResendEventEnvelope;
    try { parsed = JSON.parse(input.rawBody) as ResendEventEnvelope; } catch { throw new Error("Webhook payload is not valid JSON"); }
    if (typeof parsed.type !== "string" || typeof parsed.created_at !== "string" || typeof parsed.data?.email_id !== "string" || !input.eventId || parsed.type.length > 100 || parsed.data.email_id.length > 200) throw new Error("Webhook payload is malformed");
    if (!Number.isFinite(Date.parse(parsed.created_at))) throw new Error("Webhook event time is invalid");
    const correlation = await this.store.correlate(input.organizationId, "resend-email", parsed.data.email_id);
    if (!correlation) throw new Error("Unknown or cross-tenant provider message identity");
    const event: CommunicationDeliveryEvent = deepFreeze({ id: `delivery:${hash(JSON.stringify([input.organizationId, "resend-email", input.eventId]))}`, organizationId: correlation.organizationId, executionId: correlation.executionId, attemptId: correlation.attemptId, providerId: correlation.providerId, providerMessageId: correlation.providerMessageId, providerEventId: input.eventId, status: statusFor(parsed.type), occurredAt: new Date(parsed.created_at).toISOString(), evidenceCode: evidenceCodeFor(parsed.type), payloadHash: hash(input.rawBody) });
    return this.store.record(event);
  }
}

export function deliveryProjection(events: readonly CommunicationDeliveryEvent[]): { readonly status?: CommunicationDeliveryStatus; readonly requiresReview: boolean } {
  const statuses = new Set(events.map(event => event.status));
  if (!statuses.size) return { requiresReview: false };
  if (statuses.size > 1 || statuses.has("DELIVERY_UNKNOWN")) return { status: "DELIVERY_UNKNOWN", requiresReview: true };
  return { status: events[events.length - 1]!.status, requiresReview: false };
}
