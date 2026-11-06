import { z } from "zod";
import { normalizedWhatsAppMessageSchema, type NormalizedWhatsAppMessage } from "./message-contract";
import { sha256 } from "./security";

const authorizedImportSchema = z.object({
  schemaVersion: z.literal("recoveria.whatsapp.authorized-import.v1"),
  authorization: z.object({
    reference: z.string().min(1).max(200),
    grantedBy: z.string().min(1).max(200),
    grantedAt: z.string().datetime(),
    scope: z.literal("CONVERSATIONS_AND_RECEIPTS"),
  }).strict(),
  businessIdentity: z.object({
    organizationId: z.string().min(1),
    channelAccountId: z.string().min(1),
    phoneNumber: z.string().min(1).optional(),
  }).strict(),
  sourceRecordId: z.string().min(1).max(200),
  importedAt: z.string().datetime(),
  messages: z.array(z.object({
    externalConversationId: z.string().min(1).max(200),
    externalMessageId: z.string().min(1).max(200),
    occurredAt: z.string().datetime(),
    debtorIdentity: z.object({
      phone: z.string().min(1).max(40),
      displayName: z.string().min(1).max(200).optional(),
      externalContactId: z.string().min(1).max(200).optional(),
    }).strict(),
    content: z.object({
      kind: z.enum(["TEXT", "IMAGE", "DOCUMENT", "UNSUPPORTED"]),
      text: z.string().max(24_000).optional(),
    }).strict(),
    attachments: z.array(z.object({
      evidenceId: z.string().min(1).max(200),
      filename: z.string().min(1).max(500).optional(),
      mimeType: z.string().min(1).max(200).optional(),
      sha256: z.string().min(1).max(200).optional(),
    }).strict()).max(20).default([]),
  }).strict()).min(1).max(500),
}).strict();

export type AuthorizedWhatsAppImport = z.input<typeof authorizedImportSchema>;

/**
 * Accepts only an explicit, tenant-scoped import envelope. It does not access
 * WhatsApp, WhatsApp Web, device backups, local paths, or attachment contents.
 */
export class AuthorizedWhatsAppImportAdapter {
  normalize(input: AuthorizedWhatsAppImport): readonly NormalizedWhatsAppMessage[] {
    const batch = authorizedImportSchema.parse(input);
    return batch.messages.map((message) => normalizedWhatsAppMessageSchema.parse({
      schemaVersion: "recoveria.whatsapp.normalized-message.v1",
      source: { channel: "WHATSAPP_PERSONAL_IMPORT", transport: "AUTHORIZED_IMPORT" },
      businessIdentity: batch.businessIdentity,
      debtorIdentity: message.debtorIdentity,
      content: message.content,
      attachments: message.attachments.map(attachment => ({
        ...attachment,
        acquisition: "IMPORTED_FILE_METADATA" as const,
        processingStatus: "METADATA_ONLY" as const,
      })),
      conversation: {
        externalConversationId: message.externalConversationId,
        externalMessageId: message.externalMessageId,
        occurredAt: message.occurredAt,
      },
      evidence: {
        sourceRecordId: `${batch.sourceRecordId}:${message.externalMessageId}`,
        payloadHash: sha256(JSON.stringify({ batch: batch.sourceRecordId, message })),
        authorizationRef: batch.authorization.reference,
        importedAt: batch.importedAt,
      },
    }));
  }
}
