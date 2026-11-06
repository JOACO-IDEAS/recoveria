import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type {
  ConversationEventInput, CrmOperationKind, CrmOperationResult, CrmRequestContext, DebtorLookup, FollowUpInput,
  InvoiceLookup, PaymentPromiseInput, PaymentReportedInput, RecoveriaCrmAdapter, ReviewFlagInput,
} from "./crm-adapter";
import type { CrmCandidateEvent, CrmCandidateEventType, CrmInvoiceCandidate, IncomingWhatsAppMessage, WhatsAppInterpretation } from "./types";

export interface CrmInvoiceCatalog { candidates(organizationId: string): Promise<readonly CrmInvoiceCandidate[]> }

const digits = (value: string) => value.replace(/\D/g, "").replace(/^0+/, "");
const typeByIntent: Record<WhatsAppInterpretation["intent"], CrmCandidateEventType> = {
  PAYMENT_FULL_REPORTED: "PAGO_TOTAL_INFORMADO", PAYMENT_PARTIAL_REPORTED: "PAGO_PARCIAL_INFORMADO", PAYMENT_PROMISE: "PROMESA_PAGO_INFORMADA",
  PROMISE_BROKEN: "INCUMPLIMIENTO_INFORMADO", DEBT_DISPUTE: "DISPUTA_INFORMADA", DOCUMENT_REQUEST: "DOCUMENTACION_SOLICITADA",
  RECEIPT_ATTACHED: "COMPROBANTE_RECIBIDO", CONTACT_REQUEST: "CONTACTO_SOLICITADO", INFORMATION_ONLY: "INFORMACION_RECIBIDA", AMBIGUOUS: "REVISION_REQUERIDA",
};

export class InMemoryCrmInvoiceCatalog implements CrmInvoiceCatalog {
  constructor(private readonly invoices: readonly CrmInvoiceCandidate[]) {}
  async candidates(organizationId: string) { return this.invoices.filter(item => item.organizationId === organizationId).map(item => structuredClone(item)); }
}

export class PrismaCrmInvoiceCatalog implements CrmInvoiceCatalog {
  constructor(private readonly client: PrismaClient) {}
  async candidates(organizationId: string): Promise<readonly CrmInvoiceCandidate[]> {
    const rows = await this.client.invoice.findMany({ where: { organizationId }, include: { issuer: true, billedTo: true, receivable: { include: { caseLinks: true } } }, orderBy: { issuedAt: "desc" }, take: 500 });
    return rows.flatMap(row => { const caseId = row.receivable?.caseLinks[0]?.caseId; const party = row.billedTo ?? row.issuer; return caseId ? [{ id: row.id, organizationId: row.organizationId, caseId, partyId: party.id, partyName: party.displayName, invoiceNumber: row.invoiceNumber, currency: row.currency }] : []; });
  }
}

/**
 * Compatibility adapter for the audited Prisma repository. Reads are delegated
 * to its existing invoice catalog; every would-be write remains PROPOSED. The
 * future Hostinger adapter must implement the same port through an authorized
 * backend API and must not reuse this class as a production write path.
 */
export class ReadOnlyCatalogRecoveriaCrmAdapter implements RecoveriaCrmAdapter {
  constructor(private readonly catalog: CrmInvoiceCatalog) {}

  async findDebtor(context: CrmRequestContext, lookup: DebtorLookup) {
    const candidates = await this.catalog.candidates(context.organizationId); const normalized = lookup.displayName?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return [...new Map(candidates.filter(item => !normalized || item.partyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized)).map(item => [item.partyId, { id: item.partyId, organizationId: item.organizationId, displayName: item.partyName }])).values()];
  }

  async findInvoice(context: CrmRequestContext, lookup: InvoiceLookup) {
    const digits = (value: string) => value.replace(/\D/g, "").replace(/^0+/, ""); const references = lookup.references.map(digits).filter(Boolean);
    return (await this.catalog.candidates(context.organizationId)).filter(item => (!lookup.debtorId || item.partyId === lookup.debtorId) && references.some(reference => { const number = digits(item.invoiceNumber); return number === reference || number.endsWith(reference) || reference.endsWith(number); }))
      .map(item => ({ id: item.id, organizationId: item.organizationId, debtorId: item.partyId, caseId: item.caseId, invoiceNumber: item.invoiceNumber, currency: item.currency }));
  }

  async getOutstandingBalance(context: CrmRequestContext, invoiceId: string) {
    const invoice = (await this.catalog.candidates(context.organizationId)).find(item => item.id === invoiceId);
    return invoice?.outstandingMinor === undefined ? null : { invoiceId, amountMinor: invoice.outstandingMinor, currency: invoice.currency, authoritative: false, observedAt: new Date().toISOString() };
  }

  async createConversationEvent(context: CrmRequestContext, input: ConversationEventInput) { return this.proposed(context, "CONVERSATION_EVENT", `Persistir conversación ${input.messageId}`, input.messageId); }
  async createPaymentReportedEvent(context: CrmRequestContext, input: PaymentReportedInput) { return this.proposed(context, "PAYMENT_REPORTED", "Crear pago informado sin impacto contable", input.invoiceId); }
  async createPaymentPromise(context: CrmRequestContext, input: PaymentPromiseInput) { return this.proposed(context, "PAYMENT_PROMISE", `Crear promesa para ${input.promisedFor}`, input.invoiceId); }
  async scheduleFollowUp(context: CrmRequestContext, input: FollowUpInput) { return this.proposed(context, "FOLLOW_UP_SCHEDULED", `Programar seguimiento para ${input.dueAt}`, input.caseId); }
  async flagForReview(context: CrmRequestContext, input: ReviewFlagInput) { return this.proposed(context, "REVIEW_FLAGGED", `Marcar revisión: ${input.reasons.join(", ")}`, input.sourceMessageId); }

  private proposed(context: CrmRequestContext, kind: CrmOperationKind, summary: string, targetId?: string): CrmOperationResult {
    return { operationId: randomUUID(), kind, status: "PROPOSED", idempotencyKey: context.idempotencyKey, summary, targetId, accountingEffect: "NONE" };
  }
}

export async function buildCrmCandidateEvent(message: IncomingWhatsAppMessage, interpretation: WhatsAppInterpretation, catalog: CrmInvoiceCatalog): Promise<CrmCandidateEvent> {
  const available = await catalog.candidates(message.organizationId); const warnings = [...interpretation.ambiguityReasons];
  const byReference = interpretation.invoiceReferences.flatMap(reference => {
    const ref = digits(reference); return available.filter(invoice => { const number = digits(invoice.invoiceNumber); return Boolean(ref) && (number === ref || number.endsWith(ref) || ref.endsWith(number)); });
  });
  const matches = [...new Map(byReference.map(item => [item.id, item])).values()];
  if (!matches.length) warnings.push("CRM_FACTURA_NO_IDENTIFICADA");
  if (matches.length > 1) warnings.push("CRM_FACTURA_AMBIGUA");
  const unambiguous = matches.length === 1 ? matches[0] : undefined;
  return {
    id: randomUUID(), organizationId: message.organizationId, sourceMessageId: message.metaMessageId,
    caseId: unambiguous?.caseId, partyId: unambiguous?.partyId, invoiceIds: unambiguous ? [unambiguous.id] : [], type: typeByIntent[interpretation.intent],
    reportedAmountMinor: interpretation.reportedPayment?.amountMinor, reportedCurrency: interpretation.reportedPayment?.currency,
    remainingCommitmentMinor: interpretation.remainingCommitment?.amountMinor, promisedFor: interpretation.promisedFor ?? undefined,
    accreditationStatus: "PENDING", reconciliationStatus: "PENDING", reviewRequired: interpretation.requiresHumanReview || matches.length !== 1,
    warnings: [...new Set(warnings)], evidenceRefs: interpretation.evidenceMessageIds.map(id => `whatsapp-message:${id}`),
  };
}
