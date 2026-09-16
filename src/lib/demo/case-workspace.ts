// Phase 4.7 — showroom-only case workspace overlay.
// Adds payment-claim, decision, communication-preview, activity-feed and
// balance-quality concepts on top of the existing demo model. Nothing here
// touches src/lib/domain, src/modules/*, or the core synthetic truth set —
// it only layers additional synthetic narrative onto existing case/invoice
// ids so the Phase 4.1–4.6 numbers already covered by tests stay exact.
import { money } from "@/components/ui";
import { demoModel as m } from "@/lib/demo/product-model";

export type BalanceQuality = "DOCUMENTADO" | "RECONSTRUIDO" | "NO_DETERMINADO";

export interface PaymentClaim {
  readonly id: string;
  readonly caseId: string;
  readonly invoiceIds: readonly string[];
  readonly amountCents: number;
  readonly reportedAt: string;
  readonly channel: string;
  readonly note: string;
  readonly status: "AWAITING_VERIFICATION";
}

// A single illustrative payment claim: a contact reported a transfer, but no
// bank reconciliation exists yet. Deliberately NOT written into the ledger —
// a payment claim must never move outstandingCents on its own.
export const PAYMENT_CLAIMS: readonly PaymentClaim[] = [
  {
    id: "claim-i22",
    caseId: "case-b02",
    invoiceIds: ["i22"],
    amountCents: 140_000_00,
    reportedAt: "2026-08-28T00:00:00.000Z",
    channel: "WhatsApp",
    note: "El contacto indicó que realizó una transferencia el 28/08 por la factura F-0022.",
    status: "AWAITING_VERIFICATION",
  },
];

export function paymentClaimForCase(caseId: string): PaymentClaim | undefined {
  return PAYMENT_CLAIMS.find((claim) => claim.caseId === caseId);
}

export function paymentClaimForInvoice(invoiceId: string): PaymentClaim | undefined {
  return PAYMENT_CLAIMS.find((claim) => claim.invoiceIds.includes(invoiceId));
}

// Balance quality is a presentation-layer classification only. It never
// changes outstandingCents; it only tells the operator how that number was
// arrived at, per the "invoice existence does not prove balance" principle.
export function balanceQualityForEntity(entityId: string): BalanceQuality {
  const entity = m.entities.find((item) => item.id === entityId);
  if (!entity) return "NO_DETERMINADO";
  if (entity.invoices.some((invoice) => invoice.reviewRequired)) return "NO_DETERMINADO";
  if (entity.invoices.some((invoice) => invoice.status === "PARTIALLY_PAID" || invoice.status === "DISPUTED")) return "RECONSTRUIDO";
  return "DOCUMENTADO";
}

export const balanceQualityLabel: Record<BalanceQuality, string> = {
  DOCUMENTADO: "Documentado",
  RECONSTRUIDO: "Reconstruido",
  NO_DETERMINADO: "No determinado",
};

export const balanceQualityExplanation: Record<BalanceQuality, string> = {
  DOCUMENTADO: "El saldo surge directamente de facturas y pagos sin conflictos pendientes.",
  RECONSTRUIDO: "El saldo se reconstruyó combinando pagos parciales, créditos o disputas registradas.",
  NO_DETERMINADO: "Hay evidencia pendiente de confirmación; el saldo todavía no puede tomarse como definitivo.",
};

export interface HumanDecisionOption {
  readonly id: "REVIEW_EVIDENCE" | "CONFIRM" | "REJECT" | "REQUEST_INFO" | "PREPARE_FOLLOW_UP";
  readonly label: string;
  readonly detail: string;
}

const ALL_DECISIONS: Record<HumanDecisionOption["id"], HumanDecisionOption> = {
  REVIEW_EVIDENCE: { id: "REVIEW_EVIDENCE", label: "Revisar evidencia", detail: "Abrir la evidencia completa antes de decidir." },
  CONFIRM: { id: "CONFIRM", label: "Confirmar", detail: "Registrar la confirmación humana sobre este hecho." },
  REJECT: { id: "REJECT", label: "Rechazar", detail: "Registrar que este hecho no corresponde." },
  REQUEST_INFO: { id: "REQUEST_INFO", label: "Solicitar información", detail: "Pedir al contacto una confirmación adicional." },
  PREPARE_FOLLOW_UP: { id: "PREPARE_FOLLOW_UP", label: "Preparar seguimiento", detail: "Generar un borrador de comunicación para revisión." },
};

// The decision set is contextual: a disputed case never offers a one-click
// escalation, a payment claim always offers validation before anything else.
export function decisionOptionsForCase(caseId: string): readonly HumanDecisionOption[] {
  const c = m.cases.find((item) => item.id === caseId);
  if (!c) return [];
  const claim = paymentClaimForCase(caseId);
  if (c.dispute.value) return [ALL_DECISIONS.REVIEW_EVIDENCE, ALL_DECISIONS.REQUEST_INFO];
  if (claim) return [ALL_DECISIONS.REVIEW_EVIDENCE, ALL_DECISIONS.CONFIRM, ALL_DECISIONS.REJECT, ALL_DECISIONS.REQUEST_INFO];
  if (c.recommendation.attentionType === "REVIEW_ENTITY" || c.recommendation.attentionType === "ADD_CONTACT") {
    return [ALL_DECISIONS.REVIEW_EVIDENCE, ALL_DECISIONS.REQUEST_INFO];
  }
  return [ALL_DECISIONS.REVIEW_EVIDENCE, ALL_DECISIONS.PREPARE_FOLLOW_UP, ALL_DECISIONS.REQUEST_INFO];
}

export interface CommunicationPreview {
  readonly caseId: string;
  readonly channel: "EMAIL" | "WHATSAPP";
  readonly recipientName: string;
  readonly recipientPoint: string;
  readonly authorizedContext: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly evidenceUsed: readonly string[];
  readonly requiresRevalidation: true;
}

// Deterministic, fully synthetic draft. This mirrors the shape of the real
// communication-preparation safety model (channel, authorized recipient,
// authorized facts, evidence, mandatory revalidation before any send) but is
// intentionally NOT wired to src/modules/communication-preparation or
// communication-execution: this showroom never claims to cross a real
// provider boundary, so it does not need the durable execution machinery
// that boundary requires. See docs/RECOVERIA-PHASE-4-7-PRODUCT-SURFACE-V1.md.
export function buildCommunicationPreview(caseId: string): CommunicationPreview | undefined {
  const c = m.cases.find((item) => item.id === caseId);
  if (!c) return undefined;
  const contact = m.entities.find((entity) => entity.id === c.administrationId)?.contacts[0];
  const invoices = m.invoices.filter((invoice) => c.source.invoiceIds.includes(invoice.id) && invoice.outstandingCents > 0);
  const invoiceList = invoices.map((invoice) => invoice.invoiceNumber).join(", ") || "sin facturas con saldo pendiente";
  const total = invoices.reduce((sum, invoice) => sum + invoice.outstandingCents, 0);
  return {
    caseId,
    channel: "EMAIL",
    recipientName: contact?.displayName ?? "Contacto sin confirmar",
    recipientPoint: contact?.points[0]?.value ?? "Sin canal confirmado",
    authorizedContext: [
      `Facturas incluidas: ${invoiceList}`,
      `Monto autorizado: ${money(total)}`,
      `Consorcio: ${c.buildingName}`,
    ],
    subject: `${c.entityName} · Seguimiento de saldo pendiente`,
    body: `Hola, te escribimos desde RecoverIA en representación de la gestión de cobranzas de ${c.buildingName}. Nuestros registros muestran un saldo pendiente de ${money(total)} correspondiente a ${invoiceList}. Si ya realizaste el pago, contanos para poder verificarlo contra nuestra evidencia. Si tenés alguna consulta o dificultad, respondé este mensaje.`,
    evidenceUsed: [...new Set(invoices.map((invoice) => invoice.evidenceRef))],
    requiresRevalidation: true,
  };
}

export interface KnowledgeItem { readonly text: string; readonly evidenceRefs: readonly string[] }

// What RecoverIA knows vs. does not know for a given case — the same
// know/unknown vocabulary used throughout the product, made explicit as its
// own panel instead of implied by absence.
export function knowledgeGapsForCase(caseId: string): { readonly known: readonly KnowledgeItem[]; readonly unknown: readonly KnowledgeItem[] } {
  const c = m.cases.find((item) => item.id === caseId);
  if (!c) return { known: [], unknown: [] };
  const claim = paymentClaimForCase(caseId);
  const known: KnowledgeItem[] = [
    { text: `Saldo pendiente: ${money(c.outstandingCents.value)}, reconstruido a partir del ledger documentado.`, evidenceRefs: c.outstandingCents.evidenceRefs },
    { text: `${c.overdueInvoiceCount.value} factura${c.overdueInvoiceCount.value === 1 ? "" : "s"} vencida${c.overdueInvoiceCount.value === 1 ? "" : "s"} con saldo pendiente.`, evidenceRefs: c.overdueInvoiceCount.evidenceRefs },
  ];
  if (c.lastContactAt.value) known.push({ text: `Último contacto registrado el ${c.lastContactAt.value}.`, evidenceRefs: c.lastContactAt.evidenceRefs });
  if (c.dispute.value) known.push({ text: "Existe una disputa registrada sobre al menos una factura.", evidenceRefs: c.dispute.evidenceRefs });
  if (c.promise.value !== "NONE") known.push({ text: `Hay un compromiso de pago con estado "${c.promise.value === "ACTIVE" ? "activo" : c.promise.value === "MISSED" ? "incumplido" : c.promise.value}".`, evidenceRefs: c.promise.evidenceRefs });
  if (claim) known.push({ text: `El contacto informó una transferencia de ${money(claim.amountCents)}.`, evidenceRefs: [claim.id] });

  const unknown: KnowledgeItem[] = [];
  if (claim) unknown.push({ text: "Si esa transferencia informada llegó a imputarse contra la factura correspondiente.", evidenceRefs: [claim.id] });
  if (!c.lastContactAt.value) unknown.push({ text: "Si el contacto llegó a ver algún intento de contacto anterior.", evidenceRefs: c.lastContactAt.evidenceRefs });
  if (c.entityState.value !== "CONFIRMED") unknown.push({ text: "Si la administración asociada a esta factura es la correcta.", evidenceRefs: c.entityState.evidenceRefs });
  if (!c.contactAvailable.value) unknown.push({ text: "A quién contactar: no hay un canal de contacto confirmado.", evidenceRefs: c.contactAvailable.evidenceRefs });
  if (c.promise.value === "ACTIVE") unknown.push({ text: "Si el compromiso de pago se cumplirá en la fecha estimada.", evidenceRefs: c.promise.evidenceRefs });
  if (c.legalReviewFlag.value) unknown.push({ text: "Cuál es la decisión legal a tomar: esta revisión no implica una acción legal iniciada.", evidenceRefs: c.legalReviewFlag.evidenceRefs });
  if (!unknown.length) unknown.push({ text: "No hay vacíos de información identificados más allá de la evolución futura del caso.", evidenceRefs: c.outstandingCents.evidenceRefs });
  return { known, unknown };
}

export interface ActivityEntry {
  readonly id: string;
  readonly caseId: string;
  readonly entityName: string;
  readonly occurredAt: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: "neutral" | "positive" | "critical";
}

const eventTone: Record<string, ActivityEntry["tone"]> = {
  CASE_OPENED: "neutral",
  NO_RESPONSE: "neutral",
  PARTIAL_PAYMENT: "positive",
  INVOICE_DISPUTED: "critical",
  PROMISE_RECORDED: "neutral",
  PROMISE_MISSED: "critical",
};

const eventDetail: Record<string, string> = {
  CASE_OPENED: "Se abrió el caso a partir de facturas vencidas.",
  NO_RESPONSE: "El contacto no respondió al último intento de contacto.",
  PARTIAL_PAYMENT: "Se registró un pago contra el saldo del caso.",
  INVOICE_DISPUTED: "Se registró una disputa; el seguimiento de rutina queda pausado.",
  PROMISE_RECORDED: "Se registró un compromiso de pago con fecha estimada.",
  PROMISE_MISSED: "El compromiso de pago no se cumplió en la fecha estimada.",
};

// Recent activity is derived only from events that already exist in the
// truth set (plus the one illustrative payment claim above) — nothing here
// invents a decision that isn't backed by real synthetic case data.
export function recentActivity(limit = 6): readonly ActivityEntry[] {
  const fromEvents = m.cases.flatMap((c) => c.source.events.map((event) => ({
    id: event.id,
    caseId: c.id,
    entityName: c.entityName,
    occurredAt: event.occurredAt,
    label: eventTone[event.type] === "critical" ? `Atención: ${labelForEvent(event.type)}` : labelForEvent(event.type),
    detail: eventDetail[event.type] ?? "Actualización registrada en el caso.",
    tone: eventTone[event.type] ?? "neutral",
  })));
  const fromClaims = PAYMENT_CLAIMS.map((claim) => ({
    id: claim.id,
    caseId: claim.caseId,
    entityName: m.cases.find((c) => c.id === claim.caseId)?.entityName ?? "Entidad sin confirmar",
    occurredAt: claim.reportedAt,
    label: "Pago informado por el cliente",
    detail: "Todavía requiere validación contra la evidencia bancaria antes de confirmarse.",
    tone: "neutral" as const,
  }));
  return [...fromEvents, ...fromClaims].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}

function labelForEvent(type: string): string {
  const labels: Record<string, string> = {
    CASE_OPENED: "Caso abierto",
    NO_RESPONSE: "Sin respuesta del contacto",
    PARTIAL_PAYMENT: "Pago parcial registrado",
    INVOICE_DISPUTED: "Factura en disputa",
    PROMISE_RECORDED: "Promesa de pago registrada",
    PROMISE_MISSED: "Promesa de pago incumplida",
  };
  return labels[type] ?? "Actualización del caso";
}

// "Próximas acciones": cases that need a next step but did not make the
// top-of-day attention cut (already ordered/limited by attentionOfToday).
export function upcomingActions(limit = 6): readonly { caseId: string; entityName: string; buildingName: string; label: string; detail: string }[] {
  const attentionIds = new Set(m.attention.map((item) => item.caseId));
  return m.cases
    .filter((c) => !attentionIds.has(c.id) && c.recommendation.attentionType !== "NO_ACTION")
    .sort((a, b) => b.outstandingCents.value - a.outstandingCents.value)
    .slice(0, limit)
    .map((c) => ({ caseId: c.id, entityName: c.entityName, buildingName: c.buildingName, label: c.recommendation.reasons[0]?.text ?? "Revisar caso", detail: c.buildingName }));
}
