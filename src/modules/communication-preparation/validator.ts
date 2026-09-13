import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationDraft, CommunicationDraftRequest, DraftValidationResult } from "./types";

const pesos = (cents: number) => `$${Math.trunc(cents / 100).toLocaleString("es-AR")}`;
const normalizeSafetyText = (value: string) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

const PAYMENT_FAILURE_PATTERNS = [
  /\bno recibimos el pago\b/,
  /\bel pago no fue realizado\b/,
  /\bcontinua impago\b/,
  /\bel pago informado no existe\b/,
  /\bno consta el pago\b/,
  /\bno se registro el pago\b/,
  /\bno efectuaron el pago\b/,
  /\bno efectuaste el pago\b/,
  /\bno pago\b/,
  /\bno pagaron\b/,
  /\bel pago no existe\b/,
] as const;
const BROKEN_PROMISE_PATTERNS = [
  /\bincumpliste el compromiso\b/,
  /\bincumplieron el compromiso\b/,
  /\bincumplio el compromiso\b/,
  /\bcompromiso incumplido\b/,
  /\bpromesa incumplida\b/,
] as const;
const LIABILITY_PATTERNS = [
  /\busted debe\b/,
  /\bvos debes\b/,
  /\bsu deuda\b/,
  /\btu deuda\b/,
  /\btiene una deuda\b/,
  /\btenes una deuda\b/,
  /\bes responsable (?:por|de)\b/,
  /\bdebe (?:abonar|pagar)\b/,
] as const;
const LEGAL_PRESSURE_PATTERNS = [
  /\bintimacion\b/,
  /\bintimar\b/,
  /\bcarta documento\b/,
  /\baccion(?:es)? legal(?:es)?\b/,
  /\bdemanda(?:r)?\b/,
  /\babogad[oa]s?\b/,
  /\bestudio juridico\b/,
  /\bjudicial(?:mente)?\b/,
  /\bse iniciaran acciones\b/,
  /\bse procedera\b/,
  /\binstancia legal\b/,
  /\bvia legal\b/,
  /\bprescrib\w*\b/,
] as const;
const LAST_NOTICE_PATTERNS = [/\bultimo aviso\b/, /\bultima notificacion\b/] as const;
const REPEATED_CONTACT_PATTERNS = [
  /\bte contactamos varias veces\b/,
  /\blo contactamos varias veces\b/,
  /\bya te reclamamos anteriormente\b/,
  /\bya lo reclamamos anteriormente\b/,
  /\bante la falta de respuesta\b/,
  /\bsin respuesta de su parte\b/,
  /\bno obtuvimos respuesta\b/,
  /\breiterados intentos\b/,
] as const;
const matchesAny = (value: string, patterns: readonly RegExp[]) => patterns.some(pattern => pattern.test(value));
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
  const normalizedContent = normalizeSafetyText(content);
  if (draft.organizationId !== request.organizationId || draft.caseId !== request.caseId || draft.contactId !== request.contactId || draft.channelId !== request.channelId || draft.intent !== request.intent) errors.push("DRAFT_SCOPE_MISMATCH");
  if (!draft.requiresHumanApproval) errors.push("HUMAN_APPROVAL_REQUIRED");
  const greeting = draft.body.match(/^Hola ([^,]+),/i)?.[1];
  if (greeting !== facts.contactName) errors.push("UNSUPPORTED_CONTACT_NAME");
  const allowedAmounts = new Set([facts.targetOutstandingCents, facts.targetOverdueCents, ...facts.invoiceFacts.flatMap(invoice => [invoice.outstandingCents, invoice.overdueCents])].map(pesos));
  for (const amount of content.match(/\$\s?[\d.]+/g) ?? []) if (!allowedAmounts.has(amount.replace("$ ", "$"))) errors.push("UNSUPPORTED_AMOUNT");
  const allowedInvoices = new Set(facts.invoiceFacts.map(invoice => invoice.invoiceNumber));
  for (const invoice of content.match(/\b(?:F|FAC|FC|INV)-[A-Z0-9-]+\b/gi) ?? []) if (!allowedInvoices.has(invoice)) errors.push("UNSUPPORTED_INVOICE_NUMBER");
  const sourceDates = [facts.relevantPromise?.promisedDate, ...facts.invoiceFacts.map(invoice => invoice.dueDate)].filter((date): date is string => Boolean(date));
  const allowedDates = new Set(sourceDates.flatMap(date => [date, `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`]));
  for (const date of content.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/g) ?? []) if (!allowedDates.has(date)) errors.push("UNSUPPORTED_DATE");
  if (matchesAny(normalizedContent, LEGAL_PRESSURE_PATTERNS)) errors.push("LEGAL_LANGUAGE_PROHIBITED");
  if (matchesAny(normalizedContent, LAST_NOTICE_PATTERNS)) errors.push("LAST_NOTICE_UNSUPPORTED");
  if (matchesAny(normalizedContent, LIABILITY_PATTERNS)) errors.push("LIABILITY_ASSERTION_UNSUPPORTED");
  if (facts.relevantPaymentClaim && matchesAny(normalizedContent, PAYMENT_FAILURE_PATTERNS)) errors.push("PAYMENT_FAILURE_UNSUPPORTED");
  if (!facts.relevantPromise && matchesAny(normalizedContent, BROKEN_PROMISE_PATTERNS)) errors.push("BROKEN_PROMISE_UNSUPPORTED");
  if (matchesAny(normalizedContent, REPEATED_CONTACT_PATTERNS)) errors.push("REPEATED_CONTACT_UNSUPPORTED");
  const allowedFactRefs = new Set(facts.facts.map(fact => fact.id));
  if (draft.factRefs.some(ref => !allowedFactRefs.has(ref))) errors.push("UNAUTHORIZED_FACT_REFERENCE");
  const allowedEvidence = new Set(request.evidenceRefs);
  if (draft.evidenceRefs.some(ref => !allowedEvidence.has(ref))) errors.push("UNAUTHORIZED_EVIDENCE_REFERENCE");
  return deepFreeze({ valid: errors.length === 0, errors: [...new Set(errors)].sort() });
}
