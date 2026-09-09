import type { AttentionType, PriorityTier } from "@/modules/operational-intelligence/types";

const priorityLabels: Record<PriorityTier, string> = { CRITICAL: "Crítica", HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" };
const attentionLabels: Record<AttentionType, string> = {
  REVIEW_ENTITY: "Identidad por confirmar",
  ADD_CONTACT: "Falta información de contacto",
  FOLLOW_UP: "Requiere seguimiento",
  VERIFY_PROMISE: "Promesa incumplida",
  REVIEW_DISPUTE: "Revisar disputa",
  REVIEW_OLD_RECEIVABLE: "Deuda antigua",
  REVIEW_LEGAL_THRESHOLD: "Requiere revisión",
  NO_ACTION: "Sin acción necesaria",
};

const invoiceLabels: Record<string, string> = {
  OVERDUE: "Vencida", CURRENT: "Al día", PAID: "Pagada", PARTIALLY_PAID: "Pago parcial", DISPUTED: "En disputa", REVIEW: "Requiere revisión",
};
const importStatusLabels: Record<string, string> = { PARSED: "Procesado", REVIEW_REQUIRED: "Requiere revisión", FAILED: "Falló", UNSUPPORTED: "Formato no compatible" };
const formatLabels: Record<string, string> = { PDF_NATIVE: "PDF", PDF_SCANNED: "PDF escaneado", CSV: "Archivo CSV", XLSX: "Planilla Excel", XLS: "Planilla Excel", UNSUPPORTED: "No compatible", MALFORMED: "Archivo dañado" };
const promiseLabels: Record<string, string> = { NONE: "Sin promesa", ACTIVE: "Promesa activa", FULFILLED: "Promesa cumplida", MISSED: "Promesa incumplida" };
const agingLabels: Record<string, string> = { CURRENT: "Al día", "1-30": "1–30 días", "31-60": "31–60 días", "61-90": "61–90 días", "91-180": "91–180 días", "181-365": "181–365 días", "365+": "Más de 1 año" };
const eventLabels: Record<string, string> = { CASE_OPENED: "Caso abierto", NO_RESPONSE: "Sin respuesta", PARTIAL_PAYMENT: "Pago parcial", INVOICE_DISPUTED: "Factura en disputa", PROMISE_RECORDED: "Promesa registrada", PROMISE_MISSED: "Promesa incumplida" };
const ledgerLabels: Record<string, string> = { INVOICE_ISSUED: "Factura emitida", PAYMENT: "Pago registrado", CREDIT_NOTE: "Nota de crédito", DEBIT_NOTE: "Nota de débito", ADJUSTMENT: "Ajuste" };
const reviewReasonLabels: Record<string, string> = {
  UNSUPPORTED_DOCUMENT: "El formato no es compatible", MALFORMED_DOCUMENT: "El archivo está dañado", PARSER_FAILED: "No se pudo leer el documento", DUPLICATE_REQUIRES_REVIEW: "Posible documento duplicado", MISSING_INVOICE_NUMBER: "Falta el número de factura", INVALID_AMOUNT: "El importe necesita revisión", INVALID_DUE_DATE: "La fecha de vencimiento necesita revisión", ENTITY_REVIEW_REQUIRED: "La administración necesita confirmación", AMBIGUOUS_ENTITY: "Hay más de una administración posible", UNRESOLVED_ENTITY: "No se pudo confirmar la administración",
};

export const priorityLabel = (value: PriorityTier) => priorityLabels[value];
export const attentionLabel = (value: AttentionType) => attentionLabels[value];
export const invoiceStatusLabel = (value: string) => invoiceLabels[value] ?? "Estado por revisar";
export const importStatusLabel = (value: string) => importStatusLabels[value] ?? "Estado por revisar";
export const formatLabel = (value: string) => formatLabels[value] ?? "Otro formato";
export const promiseLabel = (value: string) => promiseLabels[value] ?? "Sin información";
export const agingLabel = (value: string) => agingLabels[value] ?? value;
export const eventLabel = (value: string) => eventLabels[value] ?? "Actualización del caso";
export const ledgerLabel = (value: string) => ledgerLabels[value] ?? "Movimiento registrado";
export const reviewReasonLabel = (value: string) => reviewReasonLabels[value] ?? "Necesita confirmación manual";
export const documentLabel = (value: string) => `Documento ${value.match(/\d+/)?.[0] ?? "de demostración"}`;
export const fieldStatusLabel = (value: string) => value === "VALID" ? "Confirmado" : value === "MISSING" ? "Falta información" : value === "AMBIGUOUS" ? "Necesita confirmación" : "Revisar";
export const evidenceLabel = (value: string) => { const [kind, ...rest] = value.split(":"); const reference = rest.join(" · ").replaceAll("#", " · "); return `${kind === "doc" ? "Fuente: documento" : kind === "invoice" ? "Fuente: factura" : kind === "contact" ? "Fuente: contacto" : kind === "promise" ? "Fuente: compromiso" : "Fuente: registro"} ${reference}`; };
export const filterOptions = [
  ["ALL", "Todas"], ["OVERDUE", "Vencidas"], ["CURRENT", "Al día"], ["PAID", "Pagadas"], ["DISPUTED", "En disputa"], ["REVIEW", "Requieren revisión"], ["OLDEST", "Más antiguas"],
] as const;
