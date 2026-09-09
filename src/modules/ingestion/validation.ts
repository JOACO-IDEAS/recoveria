import type { InvoiceCandidate } from "./types";

export function validateInvoiceCandidate(candidate: InvoiceCandidate): readonly string[] {
  const reasons = new Set(candidate.reviewReasons);
  if (candidate.issuer.status !== "EXTRACTED") reasons.add("ISSUER_REQUIRES_REVIEW");
  if (candidate.amountCents.normalized !== null && candidate.amountCents.normalized <= 0) reasons.add("NON_POSITIVE_AMOUNT");
  if (candidate.currency.normalized !== null && !/^[A-Z]{3}$/.test(String(candidate.currency.normalized))) reasons.add("INVALID_CURRENCY_CODE");
  if (candidate.invoiceDate.normalized && candidate.dueDate.normalized && candidate.dueDate.normalized < candidate.invoiceDate.normalized) reasons.add("DUE_DATE_BEFORE_INVOICE_DATE");
  return [...reasons];
}
