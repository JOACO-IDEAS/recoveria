import { randomUUID } from "node:crypto";
import type { WhatsAppInterpretation } from "./types";

export const RECOVERIA_CRM_CONTRACT_VERSION = "recoveria.crm-adapter.v1" as const;

export interface CrmRequestContext {
  readonly contractVersion: typeof RECOVERIA_CRM_CONTRACT_VERSION;
  readonly organizationId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly source: "WHATSAPP";
}
export interface CrmDebtor {
  readonly id: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly phone?: string;
}

export interface CrmInvoice {
  readonly id: string;
  readonly organizationId: string;
  readonly debtorId: string;
  readonly caseId?: string;
  readonly invoiceNumber: string;
  readonly currency: string;
}

export interface CrmOutstandingBalance {
  readonly invoiceId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly authoritative: boolean;
  readonly observedAt: string;
}

export type CrmOperationKind =
  | "CONVERSATION_EVENT"
  | "PAYMENT_REPORTED"
  | "PAYMENT_PROMISE"
  | "FOLLOW_UP_SCHEDULED"
  | "REVIEW_FLAGGED";

export interface CrmOperationResult {
  readonly operationId: string;
  readonly kind: CrmOperationKind;
  readonly status: "SIMULATED" | "PROPOSED" | "ACCEPTED" | "DUPLICATE";
  readonly idempotencyKey: string;
  readonly summary: string;
  readonly targetId?: string;
  readonly accountingEffect: "NONE";
}

export interface DebtorLookup {
  readonly senderPhone: string;
  readonly displayName?: string;
  readonly taxId?: string;
}

export interface InvoiceLookup {
  readonly references: readonly string[];
  readonly debtorId?: string;
}

export interface ConversationEventInput {
  readonly messageId: string;
  readonly debtorId?: string;
  readonly invoiceIds: readonly string[];
  readonly interpretation: WhatsAppInterpretation;
  readonly evidenceRefs: readonly string[];
}

export interface PaymentReportedInput {
  readonly messageId: string;
  readonly debtorId?: string;
  readonly invoiceId?: string;
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly partial: boolean;
  readonly accreditationStatus: "PENDING";
  readonly reconciliationStatus: "PENDING";
}

export interface PaymentPromiseInput {
  readonly messageId: string;
  readonly debtorId?: string;
  readonly invoiceId?: string;
  readonly promisedFor: string;
  readonly amountMinor?: number;
  readonly currency?: string;
}

export interface FollowUpInput {
  readonly sourceMessageId: string;
  readonly debtorId?: string;
  readonly caseId?: string;
  readonly dueAt: string;
  readonly reason: "PAYMENT_PROMISE" | "PROMISE_BROKEN" | "AMBIGUOUS_CASE";
}

export interface ReviewFlagInput {
  readonly sourceMessageId: string;
  readonly debtorId?: string;
  readonly invoiceIds: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * Host-neutral CRM boundary. Implementations may call an authenticated API,
 * enqueue a command, or use a synthetic store. The WhatsApp core never knows
 * which ORM, database, hosting provider, or route shape is behind this port.
 */
export interface RecoveriaCrmAdapter {
  findDebtor(context: CrmRequestContext, lookup: DebtorLookup): Promise<readonly CrmDebtor[]>;
  findInvoice(context: CrmRequestContext, lookup: InvoiceLookup): Promise<readonly CrmInvoice[]>;
  getOutstandingBalance(context: CrmRequestContext, invoiceId: string): Promise<CrmOutstandingBalance | null>;
  createConversationEvent(context: CrmRequestContext, input: ConversationEventInput): Promise<CrmOperationResult>;
  createPaymentReportedEvent(context: CrmRequestContext, input: PaymentReportedInput): Promise<CrmOperationResult>;
  createPaymentPromise(context: CrmRequestContext, input: PaymentPromiseInput): Promise<CrmOperationResult>;
  scheduleFollowUp(context: CrmRequestContext, input: FollowUpInput): Promise<CrmOperationResult>;
  flagForReview(context: CrmRequestContext, input: ReviewFlagInput): Promise<CrmOperationResult>;
}

export interface SyntheticCrmSeed {
  readonly debtors: readonly CrmDebtor[];
  readonly invoices: readonly CrmInvoice[];
  readonly balances: readonly CrmOutstandingBalance[];
}

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\W/g, "");
const digits = (value: string) => value.replace(/\D/g, "").replace(/^0+/, "");

export class SyntheticRecoveriaCrmAdapter implements RecoveriaCrmAdapter {
  private readonly operationsByKey = new Map<string, CrmOperationResult>();

  constructor(private readonly seed: SyntheticCrmSeed) {}

  async findDebtor(context: CrmRequestContext, lookup: DebtorLookup) {
    this.assertContext(context);
    const displayName = lookup.displayName ? normalized(lookup.displayName) : "";
    return this.seed.debtors.filter(item => item.organizationId === context.organizationId && (
      (Boolean(displayName) && normalized(item.displayName).includes(displayName)) ||
      (Boolean(lookup.senderPhone) && item.phone === lookup.senderPhone)
    )).map(item => structuredClone(item));
  }

  async findInvoice(context: CrmRequestContext, lookup: InvoiceLookup) {
    this.assertContext(context);
    const references = lookup.references.map(digits).filter(Boolean);
    return this.seed.invoices.filter(item => item.organizationId === context.organizationId &&
      (!lookup.debtorId || item.debtorId === lookup.debtorId) && references.some(reference => {
        const invoiceNumber = digits(item.invoiceNumber);
        return invoiceNumber === reference || invoiceNumber.endsWith(reference) || reference.endsWith(invoiceNumber);
      })).map(item => structuredClone(item));
  }

  async getOutstandingBalance(context: CrmRequestContext, invoiceId: string) {
    this.assertContext(context);
    const invoice = this.seed.invoices.find(item => item.id === invoiceId && item.organizationId === context.organizationId);
    if (!invoice) return null;
    const balance = this.seed.balances.find(item => item.invoiceId === invoiceId);
    return balance ? structuredClone(balance) : null;
  }

  async createConversationEvent(context: CrmRequestContext, input: ConversationEventInput) {
    return this.record(context, "CONVERSATION_EVENT", `Conversación ${input.messageId} preservada como evidencia`, input.messageId);
  }

  async createPaymentReportedEvent(context: CrmRequestContext, input: PaymentReportedInput) {
    return this.record(context, "PAYMENT_REPORTED", `${input.partial ? "Pago parcial" : "Pago"} informado sin impacto contable`, input.invoiceId);
  }

  async createPaymentPromise(context: CrmRequestContext, input: PaymentPromiseInput) {
    return this.record(context, "PAYMENT_PROMISE", `Promesa registrada para ${input.promisedFor}`, input.invoiceId);
  }

  async scheduleFollowUp(context: CrmRequestContext, input: FollowUpInput) {
    return this.record(context, "FOLLOW_UP_SCHEDULED", `Seguimiento propuesto para ${input.dueAt}`, input.caseId);
  }

  async flagForReview(context: CrmRequestContext, input: ReviewFlagInput) {
    return this.record(context, "REVIEW_FLAGGED", `Revisión requerida: ${input.reasons.join(", ")}`, input.sourceMessageId);
  }

  operations() { return [...this.operationsByKey.values()].map(item => structuredClone(item)); }

  private assertContext(context: CrmRequestContext) {
    if (context.contractVersion !== RECOVERIA_CRM_CONTRACT_VERSION || !context.organizationId || !context.idempotencyKey) throw new Error("RECOVERIA_CRM_CONTEXT_INVALID");
  }

  private async record(context: CrmRequestContext, kind: CrmOperationKind, summary: string, targetId?: string): Promise<CrmOperationResult> {
    this.assertContext(context);
    const key = `${context.organizationId}\0${context.idempotencyKey}\0${kind}`;
    const existing = this.operationsByKey.get(key);
    if (existing) return { ...existing, status: "DUPLICATE" };
    const created: CrmOperationResult = { operationId: randomUUID(), kind, status: "SIMULATED", idempotencyKey: context.idempotencyKey, summary, targetId, accountingEffect: "NONE" };
    this.operationsByKey.set(key, created);
    return structuredClone(created);
  }
}
