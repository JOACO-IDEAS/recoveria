import { z } from "zod";
import { normalizedWhatsAppMessageSchema, toIncomingWhatsAppMessage, type NormalizedWhatsAppMessage } from "./message-contract";
import { sha256 } from "./security";
import type { IncomingWhatsAppMessage, WhatsAppSourceChannel } from "./types";

const mediaSchema = z.object({ id: z.string().min(1), mime_type: z.string().optional(), filename: z.string().optional(), sha256: z.string().optional(), caption: z.string().optional() }).passthrough();
const metaPayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(z.object({ value: z.object({
    metadata: z.object({ phone_number_id: z.string().min(1), display_phone_number: z.string().optional() }).passthrough(),
    contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string().optional() }).optional() }).passthrough()).optional(),
    messages: z.array(z.object({
      id: z.string().min(1), from: z.string().min(1), timestamp: z.string().regex(/^\d+$/), type: z.string(),
      text: z.object({ body: z.string() }).optional(), image: mediaSchema.optional(), document: mediaSchema.optional(),
    }).passthrough()).optional(),
  }).passthrough() }).passthrough()) }).passthrough()),
}).passthrough();

export type MetaWebhookSourceChannel = Extract<WhatsAppSourceChannel, "WHATSAPP_BUSINESS_APP_COEXISTENCE" | "WHATSAPP_CLOUD_API">;

export interface TenantPhoneRegistry {
  organizationForPhoneNumberId(phoneNumberId: string): Promise<string | null>;
  sourceChannelForPhoneNumberId?(phoneNumberId: string): Promise<MetaWebhookSourceChannel | null>;
}

export class EnvironmentTenantPhoneRegistry implements TenantPhoneRegistry {
  private readonly mapping: Readonly<Record<string, string>>;
  constructor(raw: string | undefined) {
    if (!raw?.trim()) { this.mapping = {}; return; }
    const parsed = z.record(z.string().min(1), z.string().min(1)).safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error("WHATSAPP_TENANT_MAPPING_INVALID");
    this.mapping = Object.freeze({ ...parsed.data });
  }
  async organizationForPhoneNumberId(phoneNumberId: string) { return this.mapping[phoneNumberId] ?? null; }
}

export async function normalizeMetaWebhook(
  rawBody: Uint8Array,
  registry: TenantPhoneRegistry,
  sourceChannel?: MetaWebhookSourceChannel,
): Promise<readonly NormalizedWhatsAppMessage[]> {
  let json: unknown;
  try { json = JSON.parse(new TextDecoder().decode(rawBody)); } catch { throw new Error("WHATSAPP_PAYLOAD_INVALID_JSON"); }
  const parsed = metaPayloadSchema.safeParse(json);
  if (!parsed.success) throw new Error("WHATSAPP_PAYLOAD_INVALID");
  const payloadHash = sha256(rawBody);
  const result: NormalizedWhatsAppMessage[] = [];
  for (const entry of parsed.data.entry) for (const change of entry.changes) {
    const phoneNumberId = change.value.metadata.phone_number_id;
    const organizationId = await registry.organizationForPhoneNumberId(phoneNumberId);
    if (!organizationId) throw new Error("WHATSAPP_TENANT_NOT_FOUND");
    const registeredSourceChannel = sourceChannel ?? await registry.sourceChannelForPhoneNumberId?.(phoneNumberId) ?? "WHATSAPP_CLOUD_API";
    const names = new Map((change.value.contacts ?? []).map(contact => [contact.wa_id, contact.profile?.name]));
    for (const message of change.value.messages ?? []) {
      const kind = message.type === "text" ? "TEXT" : message.type === "image" ? "IMAGE" : message.type === "document" ? "DOCUMENT" : "UNSUPPORTED";
      const media = message.image ?? message.document;
      result.push(normalizedWhatsAppMessageSchema.parse({
        schemaVersion: "recoveria.whatsapp.normalized-message.v1",
        source: { channel: registeredSourceChannel, transport: "META_WEBHOOK" },
        businessIdentity: {
          organizationId,
          channelAccountId: phoneNumberId,
          phoneNumber: change.value.metadata.display_phone_number,
        },
        debtorIdentity: {
          phone: message.from,
          displayName: names.get(message.from),
          externalContactId: message.from,
        },
        content: { kind, text: message.text?.body ?? media?.caption },
        attachments: media ? [{
          evidenceId: `meta-media:${media.id}`,
          mediaId: media.id,
          mimeType: media.mime_type,
          filename: media.filename,
          sha256: media.sha256,
          acquisition: "META_MEDIA_METADATA",
          processingStatus: "METADATA_ONLY",
        }] : [],
        conversation: {
          externalConversationId: `${phoneNumberId}:${message.from}`,
          externalMessageId: message.id,
          occurredAt: new Date(Number(message.timestamp) * 1000).toISOString(),
        },
        evidence: { sourceRecordId: message.id, payloadHash },
      }));
    }
  }
  return result;
}

export async function parseMetaWebhook(
  rawBody: Uint8Array,
  registry: TenantPhoneRegistry,
  sourceChannel?: MetaWebhookSourceChannel,
): Promise<readonly IncomingWhatsAppMessage[]> {
  return (await normalizeMetaWebhook(rawBody, registry, sourceChannel)).map(toIncomingWhatsAppMessage);
}
