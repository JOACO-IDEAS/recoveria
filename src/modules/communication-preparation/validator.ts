import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationDraft, CommunicationDraftRequest, DraftValidationResult } from "./types";

const pesos = (cents: number) => `$${Math.trunc(cents / 100).toLocaleString("es-AR")}`;
export const PROHIBITED_COMMUNICATION_CLAIMS = deepFreeze([
  "unsupported debtor or liability assertion",
  "payment failure while verification is pending",
  "unsupported broken-promise assertion",
  "prescription or limitation claim",
  "legal-action threat",
  "unsupported last-notice language",
  "unsupported repeated-contact assertion",
] as const);

export function validateCommunicationDraft(draft: CommunicationDraft, request: CommunicationDraftRequest): DraftValidationResult {
  const errors: string[] = [];
  const facts = request.authorizedFacts;
  const content = `${draft.subject ?? ""}\n${draft.body}`;
  if (draft.organizationId !== request.organizationId || draft.caseId !== request.caseId || draft.contactId !== request.contactId || draft.channelId !== request.channelId || draft.intent !== request.intent) errors.push("DRAFT_SCOPE_MISMATCH");
  if (!draft.requiresHumanApproval) errors.push("HUMAN_APPROVAL_REQUIRED");
  const greeting = draft.body.match(/^Hola ([^,]+),/i)?.[1];
  if (greeting !== facts.contactName) errors.push("UNSUPPORTED_CONTACT_NAME");
  const allowedAmounts = new Set([facts.targetOutstandingCents, facts.targetOverdueCents, ...facts.invoiceFacts.flatMap(invoice => [invoice.outstandingCents, invoice.overdueCents])].map(pesos));
  for (const amount of content.match(/\$\s?[\d.]+/g) ?? []) if (!allowedAmounts.has(amount.replace("$ ", "$"))) errors.push("UNSUPPORTED_AMOUNT");
  const allowedInvoices = new Set(facts.invoiceFacts.map(invoice => invoice.invoiceNumber));
  for (const invoice of content.match(/\b(?:FAC|FC|INV)-[A-Z0-9-]+\b/gi) ?? []) if (!allowedInvoices.has(invoice)) errors.push("UNSUPPORTED_INVOICE_NUMBER");
  const sourceDates = [facts.relevantPromise?.promisedDate, ...facts.invoiceFacts.map(invoice => invoice.dueDate)].filter((date): date is string => Boolean(date));
  const allowedDates = new Set(sourceDates.flatMap(date => [date, `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`]));
  for (const date of content.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g) ?? []) if (!allowedDates.has(date)) errors.push("UNSUPPORTED_DATE");
  if (/acciones? legales?|prescrib|prescripci[oó]n/i.test(content)) errors.push("LEGAL_LANGUAGE_PROHIBITED");
  if (/último aviso|ultima notificaci[oó]n/i.test(content)) errors.push("LAST_NOTICE_UNSUPPORTED");
  if (/usted debe|sos deudor|es responsable de la deuda/i.test(content)) errors.push("LIABILITY_ASSERTION_UNSUPPORTED");
  if (/no pag[oó]|no pagaron|el pago no existe/i.test(content) && facts.relevantPaymentClaim) errors.push("PAYMENT_FAILURE_UNSUPPORTED");
  if (/incumpli[oó]|incumplida|incumplido/i.test(content) && !facts.relevantPromise) errors.push("BROKEN_PROMISE_UNSUPPORTED");
  if (/varias veces|reiterados intentos/i.test(content) && facts.chronologySummaryFacts.filter(fact => fact.kind === "CONTACT_ATTEMPTED").length < 2) errors.push("REPEATED_CONTACT_UNSUPPORTED");
  const allowedFactRefs = new Set(facts.facts.map(fact => fact.id));
  if (draft.factRefs.some(ref => !allowedFactRefs.has(ref))) errors.push("UNAUTHORIZED_FACT_REFERENCE");
  const allowedEvidence = new Set(request.evidenceRefs);
  if (draft.evidenceRefs.some(ref => !allowedEvidence.has(ref))) errors.push("UNAUTHORIZED_EVIDENCE_REFERENCE");
  return deepFreeze({ valid: errors.length === 0, errors: [...new Set(errors)].sort() });
}
