import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export interface WhatsAppActivationSnapshot {
  readonly organization: { readonly id: string; readonly name: string };
  readonly message: null | {
    readonly fingerprint: string;
    readonly receivedAt: string;
    readonly kind: string;
    readonly job: null | { readonly status: string; readonly attempts: number; readonly failureCode: string | null };
    readonly interpretation: null | { readonly provider: string; readonly model: string; readonly intent: string };
    readonly event: null | {
      readonly type: string;
      readonly invoiceIds: readonly string[];
      readonly accreditationStatus: string;
      readonly reconciliationStatus: string;
      readonly reviewRequired: boolean;
      readonly warnings: readonly string[];
    };
  };
}

export async function readWhatsAppActivationSnapshot(client: PrismaClient, organizationId: string): Promise<WhatsAppActivationSnapshot> {
  const organization = await client.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
  if (!organization) throw new Error("WHATSAPP_ACTIVATION_TENANT_NOT_FOUND");
  const message = await client.whatsAppInboundMessage.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { job: true, interpretation: true, candidateEvent: true },
  });
  if (!message) return { organization, message: null };
  const output = message.interpretation?.output;
  const intent = output && typeof output === "object" && !Array.isArray(output) && typeof (output as Record<string, unknown>).intent === "string"
    ? (output as Record<string, unknown>).intent as string
    : "UNKNOWN";
  return {
    organization,
    message: {
      fingerprint: createHash("sha256").update(message.metaMessageId).digest("hex").slice(0, 12),
      receivedAt: message.receivedAt.toISOString(),
      kind: message.kind,
      job: message.job ? { status: message.job.status, attempts: message.job.attempts, failureCode: message.job.failureCode } : null,
      interpretation: message.interpretation ? { provider: message.interpretation.provider, model: message.interpretation.model, intent } : null,
      event: message.candidateEvent ? {
        type: message.candidateEvent.type,
        invoiceIds: message.candidateEvent.invoiceIds,
        accreditationStatus: message.candidateEvent.accreditationStatus,
        reconciliationStatus: message.candidateEvent.reconciliationStatus,
        reviewRequired: message.candidateEvent.reviewRequired,
        warnings: message.candidateEvent.warnings,
      } : null,
    },
  };
}
