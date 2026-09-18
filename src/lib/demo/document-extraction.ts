// Phase 4.7 — showroom-only document extraction overlay for the Document
// Viewer. Confidence tiers mirror the real-document findings from Phase
// 4.6A/4.6B (sanitized, no Client Zero values): identity, issue date, fiscal
// authorization, tax id, currency and nominal total are reliably extractable
// FACTs; due date and current payment status are frequently not present on
// the document itself and must stay UNKNOWN; installment/stage relationships
// are, at best, an INFERENCE that requires human confirmation.
import type { InvoiceRow } from "@/lib/demo/product-model";

export type FieldConfidence = "FACT" | "INFERENCE" | "UNKNOWN";

export interface ExtractedField {
  readonly label: string;
  readonly value: string;
  readonly confidence: FieldConfidence;
  readonly note?: string;
  readonly highlightId: string;
}

export interface DocumentExtraction {
  readonly invoiceId: string;
  readonly fields: readonly ExtractedField[];
  readonly installmentNote?: ExtractedField;
}

// Fully synthetic, deterministic placeholder CUIT — never derived from any
// real tax identifier. The round, repeated digits are intentional so it
// reads unmistakably as a placeholder.
function syntheticCuit(administrationId?: string): string {
  const index = administrationId ? Number(administrationId.replace(/[^0-9]/g, "")) || 1 : 0;
  return `30-7000000${index % 10}-${(index % 9) + 1}`;
}

// A pair of invoices deliberately flagged as a possible (not confirmed)
// installment relationship, per the "related installment/project documents
// must not be collapsed as duplicates" learning.
const INSTALLMENT_PAIRS: Record<string, string> = { i17: "Posible cuota 1 de 2 de un mismo proyecto con Administración Sur SRL.", i18: "Posible cuota 2 de 2 de un mismo proyecto con Administración Sur SRL." };

// Documents whose due date could not be confirmed directly from the scanned
// document (independent from whatever the ledger separately records).
const DUE_DATE_UNKNOWN = new Set(["i15"]);

export function buildDocumentExtraction(invoice: InvoiceRow): DocumentExtraction {
  const fields: ExtractedField[] = [
    { label: "Número de factura", value: invoice.invoiceNumber, confidence: "FACT", highlightId: "number" },
    { label: "Fecha de emisión", value: new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(invoice.issuedAt)), confidence: "FACT", highlightId: "issued" },
    { label: "CUIT del cliente", value: syntheticCuit(invoice.administrationId), confidence: "FACT", note: "Identificador sintético de demostración.", highlightId: "cuit" },
    { label: "Moneda", value: invoice.currency, confidence: "FACT", highlightId: "currency" },
    { label: "Importe nominal", value: new Intl.NumberFormat("es-AR", { style: "currency", currency: invoice.currency, maximumFractionDigits: 0 }).format(invoice.totalCents / 100), confidence: "FACT", note: "El importe nominal no es el saldo actual.", highlightId: "total" },
    DUE_DATE_UNKNOWN.has(invoice.id)
      ? { label: "Vencimiento de pago", value: "No encontrado en el documento", confidence: "UNKNOWN", highlightId: "due" }
      : { label: "Vencimiento de pago", value: new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(invoice.dueAt)), confidence: "FACT", highlightId: "due" },
    { label: "Estado de pago", value: "No determinado a partir del documento", confidence: "UNKNOWN", note: "El estado de pago nunca puede inferirse solo de la factura.", highlightId: "payment-status" },
    { label: "Saldo actual", value: "No determinado a partir del documento", confidence: "UNKNOWN", note: "Ver la reconstrucción de RecoverIA para el saldo real.", highlightId: "balance" },
  ];
  const installmentNote = INSTALLMENT_PAIRS[invoice.id]
    ? { label: "Relación con otros documentos", value: INSTALLMENT_PAIRS[invoice.id]!, confidence: "INFERENCE" as const, note: "Requiere revisión humana antes de tratarlas como relacionadas.", highlightId: "installment" }
    : undefined;
  return { invoiceId: invoice.id, fields, installmentNote };
}
