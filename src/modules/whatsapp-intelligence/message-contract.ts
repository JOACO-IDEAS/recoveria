import { z } from "zod";
import { sha256 } from "./security";
import type { IncomingWhatsAppMessage } from "./types";

export const whatsappSourceChannelSchema = z.enum([
  "WHATSAPP_PERSONAL_IMPORT",
  "WHATSAPP_BUSINESS_APP_COEXISTENCE",
  "WHATSAPP_CLOUD_API",
]);

export const normalizedWhatsAppMessageSchema = z.object({
  schemaVersion: z.literal("recoveria.whatsapp.normalized-message.v1"),
  source: z.object({
    channel: whatsappSourceChannelSchema,
    transport: z.enum(["AUTHORIZED_IMPORT", "META_WEBHOOK"]),
  }).strict(),
  businessIdentity: z.object({
    organizationId: z.string().min(1),
    channelAccountId: z.string().min(1),
    phoneNumber: z.string().min(1).optional(),
  }).strict(),
  debtorIdentity: z.object({
    phone: z.string().min(1),
    displayName: z.string().min(1).optional(),
    externalContactId: z.string().min(1).optional(),
  }).strict(),
  content: z.object({
    kind: z.enum(["TEXT", "IMAGE", "DOCUMENT", "UNSUPPORTED"]),
    text: z.string().optional(),
  }).strict(),
  attachments: z.array(z.object({
    evidenceId: z.string().min(1),
    mediaId: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    sha256: z.string().min(1).optional(),
    acquisition: z.enum(["IMPORTED_FILE_METADATA", "META_MEDIA_METADATA"]),
    processingStatus: z.literal("METADATA_ONLY"),
  }).strict()).max(20),
  conversation: z.object({
    externalConversationId: z.string().min(1),
    externalMessageId: z.string().min(1),
    occurredAt: z.string().datetime(),
  }).strict(),
  evidence: z.object({
    sourceRecordId: z.string().min(1),
    payloadHash: z.string().min(1),
    authorizationRef: z.string().min(1).optional(),
    importedAt: z.string().datetime().optional(),
  }).strict(),
}).strict();

export type NormalizedWhatsAppMessage = z.infer<typeof normalizedWhatsAppMessageSchema>;

/**
 * Compatibility bridge into the existing V1.1 intelligence engine. All source
 * adapters stop at the normalized contract; the engine and CRM remain shared.
 */
export function toIncomingWhatsAppMessage(message: NormalizedWhatsAppMessage): IncomingWhatsAppMessage {
  const parsed = normalizedWhatsAppMessageSchema.parse(message);
  const attachment = parsed.attachments[0];
  const processingMessageId = parsed.source.channel === "WHATSAPP_PERSONAL_IMPORT"
    ? `import:${sha256(`${parsed.businessIdentity.organizationId}\0${parsed.evidence.sourceRecordId}`).slice(0, 40)}`
    : parsed.conversation.externalMessageId;
  return {
    sourceChannel: parsed.source.channel,
    organizationId: parsed.businessIdentity.organizationId,
    businessPhoneNumberId: parsed.businessIdentity.channelAccountId,
    metaMessageId: processingMessageId,
    senderPhone: parsed.debtorIdentity.phone,
    senderDisplayName: parsed.debtorIdentity.displayName,
    kind: parsed.content.kind,
    text: parsed.content.text,
    ...(attachment ? { media: {
      mediaId: attachment.mediaId ?? attachment.evidenceId,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      sha256: attachment.sha256,
    } } : {}),
    receivedAt: parsed.conversation.occurredAt,
    payloadHash: parsed.evidence.payloadHash,
  };
}
