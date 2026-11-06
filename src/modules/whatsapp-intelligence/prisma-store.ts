import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { TenantPhoneRegistry } from "./meta-webhook";
import type { CrmCandidateEvent, IncomingWhatsAppMessage, InterpretationResult } from "./types";
import type { ProcessingJob, UsageSnapshot, WhatsAppIntelligenceStore } from "./store";

export class WhatsAppPiiCipher {
  constructor(private readonly key: Uint8Array) { if (key.byteLength !== 32) throw new Error("WHATSAPP_PII_KEY_INVALID"); }
  static fromBase64(value: string | undefined) { if (!value) throw new Error("WHATSAPP_PII_KEY_NOT_CONFIGURED"); return new WhatsAppPiiCipher(Buffer.from(value, "base64")); }
  hash(value: string, organizationId: string) { return createHmac("sha256", this.key).update(organizationId).update("\0").update(value).digest("hex"); }
  seal(value: string) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.key, iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); return [iv, cipher.getAuthTag(), encrypted].map(item => item.toString("base64url")).join("."); }
  open(value: string) { try { const [iv, tag, encrypted, extra] = value.split("."); if (!iv || !tag || !encrypted || extra) throw new Error(); const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8"); } catch { throw new Error("WHATSAPP_PII_DECRYPTION_FAILED"); } }
}

export class PrismaTenantPhoneRegistry implements TenantPhoneRegistry {
  constructor(private readonly client: PrismaClient) {}
  async organizationForPhoneNumberId(phoneNumberId: string) { return (await this.client.whatsAppBusinessNumber.findFirst({ where: { phoneNumberId, active: true }, select: { organizationId: true } }))?.organizationId ?? null; }
}

export class PrismaWhatsAppIntelligenceStore implements WhatsAppIntelligenceStore {
  constructor(private readonly client: PrismaClient, private readonly pii: WhatsAppPiiCipher) {}
  async accept(message: IncomingWhatsAppMessage) {
    const existing = await this.client.whatsAppInboundMessage.findUnique({ where: { metaMessageId: message.metaMessageId }, include: { conversation: true, businessNumber: true } });
    if (existing) { await this.audit(existing.organizationId, "MESSAGE_RECEIVED", existing.id, "DUPLICATE"); return { inserted: false, message: this.fromRow(existing) }; }
    const business = await this.client.whatsAppBusinessNumber.findFirst({ where: { organizationId: message.organizationId, phoneNumberId: message.businessPhoneNumberId, active: true } });
    if (!business) throw new Error("WHATSAPP_TENANT_NOT_FOUND");
    try {
      const created = await this.client.$transaction(async tx => {
        const conversation = await tx.whatsAppConversation.upsert({
          where: { organizationId_businessNumberId_senderPhoneHash: { organizationId: message.organizationId, businessNumberId: business.id, senderPhoneHash: this.pii.hash(message.senderPhone, message.organizationId) } },
          create: { organizationId: message.organizationId, businessNumberId: business.id, senderPhoneHash: this.pii.hash(message.senderPhone, message.organizationId), senderPhoneCipher: this.pii.seal(message.senderPhone), lastMessageAt: new Date(message.receivedAt) },
          update: { lastMessageAt: new Date(message.receivedAt) },
        });
        return tx.whatsAppInboundMessage.create({ data: {
          organizationId: message.organizationId, businessNumberId: business.id, conversationId: conversation.id, metaMessageId: message.metaMessageId, kind: message.kind,
          senderDisplayNameCipher: message.senderDisplayName ? this.pii.seal(message.senderDisplayName) : null, textCipher: message.text ? this.pii.seal(message.text) : null,
          mediaMetadata: message.media ? { mediaId: message.media.mediaId, mimeType: message.media.mimeType, sha256: message.media.sha256, filenameCipher: message.media.filename ? this.pii.seal(message.media.filename) : undefined } as Prisma.InputJsonValue : Prisma.JsonNull,
          receivedAt: new Date(message.receivedAt), payloadHash: message.payloadHash, purgeAfter: new Date(Date.parse(message.receivedAt) + business.retentionDays * 86_400_000),
        }, include: { conversation: true, businessNumber: true } });
      });
      await this.audit(message.organizationId, "MESSAGE_RECEIVED", created.id, "ACCEPTED");
      return { inserted: true, message: this.fromRow(created) };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const duplicate = await this.client.whatsAppInboundMessage.findUniqueOrThrow({ where: { metaMessageId: message.metaMessageId }, include: { conversation: true, businessNumber: true } });
      await this.audit(duplicate.organizationId, "MESSAGE_RECEIVED", duplicate.id, "DUPLICATE");
      return { inserted: false, message: this.fromRow(duplicate) };
    }
  }
  async conversation(organizationId: string, senderPhone: string, limit: number) {
    const rows = await this.client.whatsAppInboundMessage.findMany({ where: { organizationId, conversation: { senderPhoneHash: this.pii.hash(senderPhone, organizationId) } }, include: { conversation: true, businessNumber: true }, orderBy: { receivedAt: "desc" }, take: limit });
    return rows.reverse().map(row => this.fromRow(row));
  }
  async message(messageId: string) { const row = await this.client.whatsAppInboundMessage.findUnique({ where: { metaMessageId: messageId }, include: { conversation: true, businessNumber: true } }); return row ? this.fromRow(row) : null; }
  async enqueue(message: IncomingWhatsAppMessage) { const row = await this.client.whatsAppInboundMessage.findUniqueOrThrow({ where: { metaMessageId: message.metaMessageId } }); await this.client.whatsAppProcessingJob.upsert({ where: { messageId: row.id }, create: { organizationId: message.organizationId, messageId: row.id }, update: {} }); }
  async claim(now: string): Promise<ProcessingJob | null> {
    await this.client.whatsAppProcessingJob.updateMany({ where: { status: "RUNNING", updatedAt: { lt: new Date(Date.parse(now) - 5 * 60_000) } }, data: { status: "RETRY", failureCode: "WHATSAPP_WORKER_INTERRUPTED", nextAttemptAt: new Date(now) } });
    for (let attempts = 0; attempts < 3; attempts += 1) {
      const candidate = await this.client.whatsAppProcessingJob.findFirst({ where: { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: new Date(now) } }, include: { message: true }, orderBy: { nextAttemptAt: "asc" } });
      if (!candidate) return null;
      const updated = await this.client.whatsAppProcessingJob.updateMany({ where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts }, data: { status: "RUNNING", attempts: { increment: 1 } } });
      if (updated.count === 1) return { messageId: candidate.message.metaMessageId, organizationId: candidate.organizationId, status: "RUNNING", attempts: candidate.attempts + 1, nextAttemptAt: candidate.nextAttemptAt.toISOString(), failureCode: candidate.failureCode ?? undefined };
    }
    return null;
  }
  async complete(metaMessageId: string, interpretation: InterpretationResult, event: CrmCandidateEvent) {
    const message = await this.client.whatsAppInboundMessage.findUniqueOrThrow({ where: { metaMessageId } });
    await this.client.$transaction([
      this.client.whatsAppInterpretation.create({ data: { organizationId: event.organizationId, messageId: message.id, schemaVersion: interpretation.interpretation.schemaVersion, provider: interpretation.provider, model: interpretation.model, output: interpretation.interpretation as Prisma.InputJsonValue, inputTokens: interpretation.usage.inputTokens, outputTokens: interpretation.usage.outputTokens, totalTokens: interpretation.usage.totalTokens, estimatedCostUsdMicros: interpretation.usage.estimatedCostUsdMicros, latencyMs: interpretation.latencyMs } }),
      this.client.whatsAppCrmCandidateEvent.create({ data: { id: event.id, organizationId: event.organizationId, messageId: message.id, caseId: event.caseId, partyId: event.partyId, invoiceIds: [...event.invoiceIds], type: event.type, reportedAmountMinor: event.reportedAmountMinor, reportedCurrency: event.reportedCurrency, remainingCommitmentMinor: event.remainingCommitmentMinor, promisedFor: event.promisedFor, accreditationStatus: event.accreditationStatus, reconciliationStatus: event.reconciliationStatus, reviewRequired: event.reviewRequired, warnings: [...event.warnings], evidenceRefs: [...event.evidenceRefs] } }),
      this.client.whatsAppProcessingJob.update({ where: { messageId: message.id }, data: { status: "SUCCEEDED", failureCode: null } }),
      this.client.whatsAppAuditEvent.create({ data: { organizationId: event.organizationId, action: "MESSAGE_INTERPRETED", subjectType: "WHATSAPP_MESSAGE", subjectId: message.id, outcome: "SUCCEEDED", metadata: { provider: interpretation.provider, model: interpretation.model, totalTokens: interpretation.usage.totalTokens, estimatedCostUsdMicros: interpretation.usage.estimatedCostUsdMicros, reviewRequired: event.reviewRequired } } }),
    ]);
  }
  async retry(metaMessageId: string, attempts: number, nextAttemptAt: string, failureCode: string) { const message = await this.client.whatsAppInboundMessage.findUniqueOrThrow({ where: { metaMessageId } }); await this.client.$transaction([this.client.whatsAppProcessingJob.update({ where: { messageId: message.id }, data: { status: "RETRY", attempts, nextAttemptAt: new Date(nextAttemptAt), failureCode } }), this.client.whatsAppAuditEvent.create({ data: { organizationId: message.organizationId, action: "MESSAGE_INTERPRETATION", subjectType: "WHATSAPP_MESSAGE", subjectId: message.id, outcome: "RETRY", failureCode, metadata: { attempts } } })]); }
  async fail(metaMessageId: string, attempts: number, failureCode: string) { const message = await this.client.whatsAppInboundMessage.findUniqueOrThrow({ where: { metaMessageId } }); await this.client.$transaction([this.client.whatsAppProcessingJob.update({ where: { messageId: message.id }, data: { status: "FAILED", attempts, failureCode } }), this.client.whatsAppAuditEvent.create({ data: { organizationId: message.organizationId, action: "MESSAGE_INTERPRETATION", subjectType: "WHATSAPP_MESSAGE", subjectId: message.id, outcome: "FAILED", failureCode, metadata: { attempts } } })]); }
  async usage(organizationId: string, month: string): Promise<UsageSnapshot> { const start = new Date(`${month}-01T00:00:00.000Z`); const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); const aggregate = await this.client.whatsAppInterpretation.aggregate({ where: { organizationId, createdAt: { gte: start, lt: end } }, _sum: { inputTokens: true, outputTokens: true, totalTokens: true, estimatedCostUsdMicros: true } }); return { inputTokens: aggregate._sum.inputTokens ?? 0, outputTokens: aggregate._sum.outputTokens ?? 0, totalTokens: aggregate._sum.totalTokens ?? 0, estimatedCostUsdMicros: aggregate._sum.estimatedCostUsdMicros ?? 0 }; }
  async eventForMessage(metaMessageId: string): Promise<CrmCandidateEvent | null> { const row = await this.client.whatsAppCrmCandidateEvent.findFirst({ where: { message: { metaMessageId } } }); return row ? { id: row.id, organizationId: row.organizationId, sourceMessageId: metaMessageId, caseId: row.caseId ?? undefined, partyId: row.partyId ?? undefined, invoiceIds: row.invoiceIds, type: row.type as CrmCandidateEvent["type"], reportedAmountMinor: row.reportedAmountMinor === null ? undefined : Number(row.reportedAmountMinor), reportedCurrency: row.reportedCurrency ?? undefined, remainingCommitmentMinor: row.remainingCommitmentMinor === null ? undefined : Number(row.remainingCommitmentMinor), promisedFor: row.promisedFor ?? undefined, accreditationStatus: "PENDING", reconciliationStatus: "PENDING", reviewRequired: row.reviewRequired, warnings: row.warnings, evidenceRefs: row.evidenceRefs } : null; }
  private fromRow(row: { organizationId: string; metaMessageId: string; kind: IncomingWhatsAppMessage["kind"]; senderDisplayNameCipher: string | null; textCipher: string | null; mediaMetadata: unknown; receivedAt: Date; payloadHash: string; conversation: { senderPhoneCipher: string }; businessNumber: { phoneNumberId: string } }): IncomingWhatsAppMessage {
    const media = row.mediaMetadata && typeof row.mediaMetadata === "object" ? row.mediaMetadata as Record<string, unknown> : undefined;
    return { organizationId: row.organizationId, businessPhoneNumberId: row.businessNumber.phoneNumberId, metaMessageId: row.metaMessageId, senderPhone: this.pii.open(row.conversation.senderPhoneCipher), senderDisplayName: row.senderDisplayNameCipher ? this.pii.open(row.senderDisplayNameCipher) : undefined, kind: row.kind, text: row.textCipher ? this.pii.open(row.textCipher) : undefined,
      ...(typeof media?.mediaId === "string" ? { media: { mediaId: media.mediaId, mimeType: typeof media.mimeType === "string" ? media.mimeType : undefined, sha256: typeof media.sha256 === "string" ? media.sha256 : undefined, filename: typeof media.filenameCipher === "string" ? this.pii.open(media.filenameCipher) : undefined } } : {}), receivedAt: row.receivedAt.toISOString(), payloadHash: row.payloadHash };
  }
  private async audit(organizationId: string, action: string, subjectId: string, outcome: string) { await this.client.whatsAppAuditEvent.create({ data: { organizationId, action, subjectType: "WHATSAPP_MESSAGE", subjectId, outcome } }); }
}
