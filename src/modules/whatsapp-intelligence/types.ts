import { z } from "zod";
import type { CrmOperationResult } from "./crm-adapter";

export const whatsappMessageKindSchema = z.enum(["TEXT", "IMAGE", "DOCUMENT", "UNSUPPORTED"]);
export type WhatsAppMessageKind = z.infer<typeof whatsappMessageKindSchema>;

export const whatsappIntentSchema = z.enum([
  "PAYMENT_FULL_REPORTED",
  "PAYMENT_PARTIAL_REPORTED",
  "PAYMENT_PROMISE",
  "PROMISE_BROKEN",
  "DEBT_DISPUTE",
  "DOCUMENT_REQUEST",
  "RECEIPT_ATTACHED",
  "CONTACT_REQUEST",
  "INFORMATION_ONLY",
  "AMBIGUOUS",
]);
export type WhatsAppIntent = z.infer<typeof whatsappIntentSchema>;

const nullableString = z.string().min(1).nullable();
const nullableMoney = z.object({ amountMinor: z.number().int().nonnegative(), currency: z.string().length(3) }).strict().nullable();

export const interpretationSchema = z.object({
  schemaVersion: z.literal("recoveria.whatsapp.interpretation.v1"),
  intent: whatsappIntentSchema,
  debtorIdentity: z.object({ name: nullableString, taxId: nullableString, confidence: z.number().min(0).max(1) }).strict(),
  invoiceReferences: z.array(z.string().min(1)).max(20),
  reportedPayment: nullableMoney,
  remainingCommitment: nullableMoney,
  promisedFor: nullableString,
  disputeReason: nullableString,
  requestedDocument: nullableString,
  contactIntent: nullableString,
  attachmentEvidence: z.array(z.object({ messageId: z.string().min(1), kind: z.enum(["IMAGE", "DOCUMENT"]), mediaId: z.string().min(1) }).strict()).max(20),
  evidenceMessageIds: z.array(z.string().min(1)).min(1).max(50),
  confidence: z.number().min(0).max(1),
  ambiguityReasons: z.array(z.string().min(1)).max(20),
  requiresHumanReview: z.boolean(),
}).strict();
export type WhatsAppInterpretation = z.infer<typeof interpretationSchema>;

export interface IncomingWhatsAppMessage {
  readonly sourceChannel?: WhatsAppSourceChannel;
  readonly organizationId: string;
  readonly businessPhoneNumberId: string;
  readonly metaMessageId: string;
  readonly senderPhone: string;
  readonly senderDisplayName?: string;
  readonly kind: WhatsAppMessageKind;
  readonly text?: string;
  readonly media?: { readonly mediaId: string; readonly mimeType?: string; readonly filename?: string; readonly sha256?: string };
  readonly receivedAt: string;
  readonly payloadHash: string;
}

export type WhatsAppSourceChannel =
  | "WHATSAPP_PERSONAL_IMPORT"
  | "WHATSAPP_BUSINESS_APP_COEXISTENCE"
  | "WHATSAPP_CLOUD_API";

export interface ConversationContext {
  readonly organizationId: string;
  readonly senderPhone: string;
  readonly messages: readonly IncomingWhatsAppMessage[];
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsdMicros: number;
}

export interface InterpretationResult {
  readonly interpretation: WhatsAppInterpretation;
  readonly provider: "mock" | "openai";
  readonly model: string;
  readonly usage: TokenUsage;
  readonly latencyMs: number;
}

export type CrmCandidateEventType =
  | "PAGO_TOTAL_INFORMADO"
  | "PAGO_PARCIAL_INFORMADO"
  | "PROMESA_PAGO_INFORMADA"
  | "INCUMPLIMIENTO_INFORMADO"
  | "DISPUTA_INFORMADA"
  | "DOCUMENTACION_SOLICITADA"
  | "COMPROBANTE_RECIBIDO"
  | "CONTACTO_SOLICITADO"
  | "INFORMACION_RECIBIDA"
  | "REVISION_REQUERIDA";

export interface CrmCandidateEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly sourceMessageId: string;
  readonly caseId?: string;
  readonly partyId?: string;
  readonly invoiceIds: readonly string[];
  readonly type: CrmCandidateEventType;
  readonly reportedAmountMinor?: number;
  readonly reportedCurrency?: string;
  readonly remainingCommitmentMinor?: number;
  readonly promisedFor?: string;
  readonly accreditationStatus: "PENDING";
  readonly reconciliationStatus: "PENDING";
  readonly reviewRequired: boolean;
  readonly warnings: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface CrmInvoiceCandidate {
  readonly id: string;
  readonly organizationId: string;
  readonly caseId: string;
  readonly partyId: string;
  readonly partyName: string;
  readonly invoiceNumber: string;
  readonly currency: string;
  readonly outstandingMinor?: number;
}

export interface UsageLimits {
  readonly maxInputCharacters: number;
  readonly maxContextMessages: number;
  readonly maxOutputTokens: number;
  readonly monthlyTokenLimit: number;
  readonly monthlyCostUsdMicrosLimit: number;
}

export interface ProcessingOutcome {
  readonly duplicate: boolean;
  readonly message: IncomingWhatsAppMessage;
  readonly interpretation?: InterpretationResult;
  readonly event?: CrmCandidateEvent;
  readonly crmOperations?: readonly CrmOperationResult[];
  readonly warnings: readonly string[];
}
