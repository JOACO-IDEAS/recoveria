import { randomUUID } from "node:crypto";
import { RECOVERIA_CRM_CONTRACT_VERSION, type CrmOperationResult, type CrmRequestContext, type RecoveriaCrmAdapter } from "./crm-adapter";
import type { CrmCandidateEvent, IncomingWhatsAppMessage, WhatsAppInterpretation } from "./types";

const typeByIntent: Record<WhatsAppInterpretation["intent"], CrmCandidateEvent["type"]> = {
  PAYMENT_FULL_REPORTED: "PAGO_TOTAL_INFORMADO", PAYMENT_PARTIAL_REPORTED: "PAGO_PARCIAL_INFORMADO", PAYMENT_PROMISE: "PROMESA_PAGO_INFORMADA",
  PROMISE_BROKEN: "INCUMPLIMIENTO_INFORMADO", DEBT_DISPUTE: "DISPUTA_INFORMADA", DOCUMENT_REQUEST: "DOCUMENTACION_SOLICITADA",
  RECEIPT_ATTACHED: "COMPROBANTE_RECIBIDO", CONTACT_REQUEST: "CONTACTO_SOLICITADO", INFORMATION_ONLY: "INFORMACION_RECIBIDA", AMBIGUOUS: "REVISION_REQUERIDA",
};

export interface CrmSynchronizationResult {
  readonly event: CrmCandidateEvent;
  readonly operations: readonly CrmOperationResult[];
}
const operationContext = (message: IncomingWhatsAppMessage, operation: string): CrmRequestContext => ({
  contractVersion: RECOVERIA_CRM_CONTRACT_VERSION,
  organizationId: message.organizationId,
  requestId: `${message.metaMessageId}:${operation}`,
  idempotencyKey: `whatsapp:${message.metaMessageId}:${operation}`,
  source: "WHATSAPP",
});

export async function synchronizeInterpretationWithCrm(message: IncomingWhatsAppMessage, interpretation: WhatsAppInterpretation, adapter: RecoveriaCrmAdapter): Promise<CrmSynchronizationResult> {
  const warnings = [...interpretation.ambiguityReasons];
  const debtors = await adapter.findDebtor(operationContext(message, "find-debtor"), { senderPhone: message.senderPhone, displayName: interpretation.debtorIdentity.name ?? message.senderDisplayName, taxId: interpretation.debtorIdentity.taxId ?? undefined });
  if (!debtors.length) warnings.push("CRM_DEUDOR_NO_IDENTIFICADO");
  if (debtors.length > 1) warnings.push("CRM_DEUDOR_AMBIGUO");
  const debtor = debtors.length === 1 ? debtors[0] : undefined;
  const invoices = await adapter.findInvoice(operationContext(message, "find-invoice"), { references: interpretation.invoiceReferences, debtorId: debtor?.id });
  if (!invoices.length) warnings.push("CRM_FACTURA_NO_IDENTIFICADA");
  if (invoices.length > 1) warnings.push("CRM_FACTURA_AMBIGUA");
  const invoice = invoices.length === 1 ? invoices[0] : undefined;
  if (invoice) await adapter.getOutstandingBalance(operationContext(message, "get-balance"), invoice.id);

  const evidenceRefs = interpretation.evidenceMessageIds.map(id => `whatsapp-message:${id}`);
  const operations: CrmOperationResult[] = [];
  operations.push(await adapter.createConversationEvent(operationContext(message, "conversation"), { messageId: message.metaMessageId, debtorId: debtor?.id, invoiceIds: invoice ? [invoice.id] : [], interpretation, evidenceRefs }));

  if (interpretation.intent === "PAYMENT_FULL_REPORTED" || interpretation.intent === "PAYMENT_PARTIAL_REPORTED" || interpretation.intent === "RECEIPT_ATTACHED") {
    operations.push(await adapter.createPaymentReportedEvent(operationContext(message, "payment-reported"), {
      messageId: message.metaMessageId, debtorId: debtor?.id, invoiceId: invoice?.id, amountMinor: interpretation.reportedPayment?.amountMinor,
      currency: interpretation.reportedPayment?.currency, partial: interpretation.intent === "PAYMENT_PARTIAL_REPORTED", accreditationStatus: "PENDING", reconciliationStatus: "PENDING",
    }));
  }
  if (interpretation.promisedFor) {
    operations.push(await adapter.createPaymentPromise(operationContext(message, "payment-promise"), { messageId: message.metaMessageId, debtorId: debtor?.id, invoiceId: invoice?.id, promisedFor: interpretation.promisedFor, amountMinor: interpretation.remainingCommitment?.amountMinor, currency: interpretation.remainingCommitment?.currency }));
    operations.push(await adapter.scheduleFollowUp(operationContext(message, "follow-up"), { sourceMessageId: message.metaMessageId, debtorId: debtor?.id, caseId: invoice?.caseId, dueAt: interpretation.promisedFor, reason: "PAYMENT_PROMISE" }));
  } else if (interpretation.intent === "PROMISE_BROKEN") {
    operations.push(await adapter.scheduleFollowUp(operationContext(message, "follow-up"), { sourceMessageId: message.metaMessageId, debtorId: debtor?.id, caseId: invoice?.caseId, dueAt: "IMMEDIATE", reason: "PROMISE_BROKEN" }));
  }

  const reviewRequired = interpretation.requiresHumanReview || debtors.length !== 1 || invoices.length !== 1;
  if (reviewRequired) operations.push(await adapter.flagForReview(operationContext(message, "review"), { sourceMessageId: message.metaMessageId, debtorId: debtor?.id, invoiceIds: invoices.map(item => item.id), reasons: [...new Set(warnings.length ? warnings : ["REVISION_HUMANA_REQUERIDA"])] }));

  return {
    event: {
      id: randomUUID(), organizationId: message.organizationId, sourceMessageId: message.metaMessageId,
      caseId: invoice?.caseId, partyId: debtor?.id, invoiceIds: invoice ? [invoice.id] : [], type: typeByIntent[interpretation.intent],
      reportedAmountMinor: interpretation.reportedPayment?.amountMinor, reportedCurrency: interpretation.reportedPayment?.currency,
      remainingCommitmentMinor: interpretation.remainingCommitment?.amountMinor, promisedFor: interpretation.promisedFor ?? undefined,
      accreditationStatus: "PENDING", reconciliationStatus: "PENDING", reviewRequired,
      warnings: [...new Set(warnings)], evidenceRefs,
    },
    operations,
  };
}
