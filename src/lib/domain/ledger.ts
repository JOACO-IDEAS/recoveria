import type { InvoiceRecord, LedgerEntryRecord } from "./types";

export function outstandingCents(invoice: InvoiceRecord, entries: readonly LedgerEntryRecord[]): number {
  const applicable = entries.filter((entry) => entry.invoiceId === invoice.id);
  for (const entry of applicable) {
    if (entry.organizationId !== invoice.organizationId) throw new Error("Cross-tenant ledger entry rejected");
    if (entry.currency !== invoice.currency) throw new Error("Cross-currency ledger entry rejected");
    if (!Number.isSafeInteger(entry.amountCents)) throw new Error("Ledger amount must use integer minor units");
    if (entry.type === "INVOICE_ISSUED" && entry.amountCents < 0) throw new Error("Invoice issuance must be positive");
    if (["PAYMENT", "CREDIT", "WRITE_OFF"].includes(entry.type) && entry.amountCents > 0) {
      throw new Error(`${entry.type} must reduce the balance`);
    }
  }
  const balance = applicable.reduce((sum, entry) => sum + entry.amountCents, 0);
  if (balance < 0) throw new Error("Receivable cannot have a negative derived balance");
  return balance;
}
