import type { AppState, CaseRecord, DisputeRecord, Entity, EvidenceItem, ImportRecord, Invoice, NotificationItem, PaymentClaimRecord, PromiseRecord, TimelineEvent } from "./types";

// Recoveria V2.1 — seed dataset. Every number a screen displays is derived
// from this data via lib/selectors.ts. Nothing here represents Client Zero,
// real contacts, or any real company — entirely synthetic, fixed "today".
export const ASOF = "2026-09-01T00:00:00.000Z";

const entities: Entity[] = [
  { id: "ent-centro", name: "Administración Centro SRL", properties: ["Torre Libertador 1842", "Edificio Belgrano 990"] },
  { id: "ent-norte", name: "Administración Norte SRL", properties: ["Consorcio Av. Santa Fe 3200", "Edificio Arenales 2210"] },
  { id: "ent-rio", name: "Administración Río SRL", properties: ["Consorcio Güemes 1871"] },
  { id: "ent-sur", name: "Administración Sur SRL", properties: ["Torre Caballito 540"] },
  { id: "ent-plaza", name: "Administración Plaza SRL", properties: ["Consorcio Independencia 410"] },
  { id: "ent-oeste", name: "Administración Oeste SRL", properties: ["Edificio San Martín 210"] },
  { id: "ent-belgrano", name: "Administración Belgrano Norte SRL", properties: ["Torre Cabildo 1650"] },
  { id: "ent-palermo", name: "Administración Palermo SRL", properties: ["Consorcio Sarmiento 745"] },
];

const extract = (nominal: string) => [
  { field: "invoiceNumber", label: "Número de factura", value: "", classification: "FACT" as const },
  { field: "issueDate", label: "Fecha de emisión", value: "", classification: "FACT" as const },
  { field: "nominalAmount", label: "Importe nominal", value: nominal, classification: "FACT" as const },
  { field: "dueDate", label: "Vencimiento de pago", value: "No encontrado en el documento", classification: "UNKNOWN" as const },
  { field: "paymentStatus", label: "Estado de pago", value: "No determinado a partir del documento", classification: "UNKNOWN" as const },
];

const invoices: Invoice[] = [
  { id: "F-0031", entityId: "ent-centro", property: "Torre Libertador 1842", issueDate: "2026-05-06", nominalAmountCents: 43000000, outstandingCents: 43000000, daysOverdue: 118, status: "vencida", extraction: extract("$ 430.000") },
  { id: "F-0032", entityId: "ent-centro", property: "Torre Libertador 1842", issueDate: "2026-04-25", nominalAmountCents: 50000000, outstandingCents: 50000000, daysOverdue: 130, status: "vencida", extraction: extract("$ 500.000") },
  { id: "F-0033", entityId: "ent-centro", property: "Torre Libertador 1842", issueDate: "2026-05-29", nominalAmountCents: 30000000, outstandingCents: 30000000, daysOverdue: 95, status: "vencida", extraction: extract("$ 300.000") },
  { id: "F-0028", entityId: "ent-norte", property: "Consorcio Av. Santa Fe 3200", issueDate: "2026-05-28", nominalAmountCents: 80000000, outstandingCents: 80000000, daysOverdue: 96, status: "vencida", extraction: extract("$ 800.000") },
  { id: "F-0029", entityId: "ent-norte", property: "Consorcio Av. Santa Fe 3200", issueDate: "2026-06-03", nominalAmountCents: 20000000, outstandingCents: 20000000, daysOverdue: 90, status: "vencida", extraction: extract("$ 200.000") },
  { id: "F-0017", entityId: "ent-norte", property: "Edificio Arenales 2210", issueDate: "2025-08-01", nominalAmountCents: 62000000, outstandingCents: 62000000, daysOverdue: 396, status: "vencida", extraction: extract("$ 620.000") },
  { id: "F-0018", entityId: "ent-norte", property: "Edificio Arenales 2210", issueDate: "2025-08-17", nominalAmountCents: 50000000, outstandingCents: 50000000, daysOverdue: 380, status: "vencida", extraction: extract("$ 500.000") },
  { id: "F-0019", entityId: "ent-norte", property: "Edificio Arenales 2210", issueDate: "2025-08-27", nominalAmountCents: 32000000, outstandingCents: 32000000, daysOverdue: 370, status: "vencida", extraction: extract("$ 320.000") },
  { id: "F-0022", entityId: "ent-rio", property: "Consorcio Güemes 1871", issueDate: "2026-06-19", nominalAmountCents: 31000000, outstandingCents: 31000000, daysOverdue: 74, status: "disputada", disputeId: "dis-1", extraction: extract("$ 310.000") },
  { id: "F-0023", entityId: "ent-rio", property: "Consorcio Güemes 1871", issueDate: "2026-06-23", nominalAmountCents: 30000000, outstandingCents: 30000000, daysOverdue: 70, status: "vencida", extraction: extract("$ 300.000") },
  { id: "F-0024", entityId: "ent-rio", property: "Consorcio Güemes 1871", issueDate: "2026-07-03", nominalAmountCents: 20000000, outstandingCents: 20000000, daysOverdue: 60, status: "vencida", extraction: extract("$ 200.000") },
  { id: "F-0014", entityId: "ent-sur", property: "Torre Caballito 540", issueDate: "2026-07-02", nominalAmountCents: 27500000, outstandingCents: 27500000, daysOverdue: 61, status: "vencida", extraction: extract("$ 275.000") },
  { id: "F-0015", entityId: "ent-sur", property: "Torre Caballito 540", issueDate: "2026-07-05", nominalAmountCents: 27000000, outstandingCents: 27000000, daysOverdue: 58, status: "vencida", extraction: extract("$ 270.000") },
  { id: "F-0040", entityId: "ent-plaza", property: "Consorcio Independencia 410", issueDate: "2026-07-17", nominalAmountCents: 32000000, outstandingCents: 32000000, daysOverdue: 45, status: "vencida", extraction: extract("$ 320.000") },
  { id: "F-0041", entityId: "ent-plaza", property: "Consorcio Independencia 410", issueDate: "2026-07-22", nominalAmountCents: 30000000, outstandingCents: 30000000, daysOverdue: 40, status: "vencida", extraction: extract("$ 300.000") },
  { id: "F-0042", entityId: "ent-centro", property: "Edificio Belgrano 990", issueDate: "2026-07-10", nominalAmountCents: 27500000, outstandingCents: 27500000, daysOverdue: 52, status: "vencida", extraction: extract("$ 275.000") },
  { id: "F-0050", entityId: "ent-oeste", property: "Edificio San Martín 210", issueDate: "2026-07-29", nominalAmountCents: 21000000, outstandingCents: 21000000, daysOverdue: 33, status: "vencida", extraction: extract("$ 210.000") },
  { id: "F-0051", entityId: "ent-oeste", property: "Edificio San Martín 210", issueDate: "2026-08-01", nominalAmountCents: 20000000, outstandingCents: 20000000, daysOverdue: 30, status: "vencida", extraction: extract("$ 200.000") },
  { id: "F-0045", entityId: "ent-norte", property: "Edificio Arenales 2210", issueDate: "2026-07-17", nominalAmountCents: 20000000, outstandingCents: 10000000, daysOverdue: 45, status: "pagada_parcial", extraction: extract("$ 200.000") },
  { id: "F-0060", entityId: "ent-belgrano", property: "Torre Cabildo 1650", issueDate: "2026-08-25", nominalAmountCents: 15000000, outstandingCents: 15000000, daysOverdue: 0, status: "vigente", extraction: extract("$ 150.000") },
  { id: "F-0061", entityId: "ent-palermo", property: "Consorcio Sarmiento 745", issueDate: "2026-07-20", nominalAmountCents: 90000000, outstandingCents: 0, daysOverdue: 0, status: "pagada", paidAt: "2026-08-27", extraction: extract("$ 900.000") },
  { id: "F-0062", entityId: "ent-palermo", property: "Consorcio Sarmiento 745", issueDate: "2026-07-25", nominalAmountCents: 70000000, outstandingCents: 0, daysOverdue: 0, status: "pagada", paidAt: "2026-08-20", extraction: extract("$ 700.000") },
];

const cases: CaseRecord[] = [
  { id: "REC-2841", entityId: "ent-centro", property: "Torre Libertador 1842", invoiceIds: ["F-0031", "F-0032", "F-0033"], riskTier: "Crítico", score: 96, reasonCode: "PROMESA_INCUMPLIDA", reasonText: "Promesa de pago incumplida", recommendedAction: "Revisar y escalar", status: "pendiente", promiseId: "prom-1" },
  { id: "REC-2798", entityId: "ent-norte", property: "Consorcio Av. Santa Fe 3200", invoiceIds: ["F-0028", "F-0029"], riskTier: "Crítico", score: 92, reasonCode: "UMBRAL_LEGAL", reasonText: "Superó el umbral configurado para revisión legal", recommendedAction: "Validar antes de una intimación", status: "pendiente" },
  { id: "REC-2670", entityId: "ent-norte", property: "Edificio Arenales 2210", invoiceIds: ["F-0017", "F-0018", "F-0019"], riskTier: "Alto", score: 88, reasonCode: "ANTIGUEDAD", reasonText: "Deuda de alta antigüedad", recommendedAction: "Preparar propuesta de acuerdo", status: "pendiente" },
  { id: "REC-2902", entityId: "ent-rio", property: "Consorcio Güemes 1871", invoiceIds: ["F-0022", "F-0023", "F-0024"], riskTier: "Alto", score: 81, reasonCode: "DISPUTA", reasonText: "Factura en disputa", recommendedAction: "Resolver evidencia antes de continuar", status: "pendiente", disputeId: "dis-1" },
  { id: "REC-2918", entityId: "ent-sur", property: "Torre Caballito 540", invoiceIds: ["F-0014", "F-0015"], riskTier: "Alto", score: 77, reasonCode: "IDENTIDAD", reasonText: "Identidad de la administración por confirmar", recommendedAction: "Verificar identidad", status: "pendiente", identityUncertain: true },
  { id: "REC-3005", entityId: "ent-plaza", property: "Consorcio Independencia 410", invoiceIds: ["F-0040", "F-0041"], riskTier: "Medio", score: 68, reasonCode: "PAGO_INFORMADO", reasonText: "Pago informado pendiente de validar", recommendedAction: "Validar contra evidencia bancaria", status: "pendiente", paymentClaimId: "claim-1" },
  { id: "REC-3012", entityId: "ent-centro", property: "Edificio Belgrano 990", invoiceIds: ["F-0042"], riskTier: "Medio", score: 61, reasonCode: "SIN_RESPUESTA", reasonText: "Sin respuesta del contacto", recommendedAction: "Preparar seguimiento", status: "pendiente" },
  { id: "REC-3020", entityId: "ent-oeste", property: "Edificio San Martín 210", invoiceIds: ["F-0050", "F-0051"], riskTier: "Medio", score: 58, reasonCode: "PROMESA_VENCE_HOY", reasonText: "Promesa de pago vence hoy", recommendedAction: "Confirmar cumplimiento hoy", status: "pendiente", promiseId: "prom-2" },
  { id: "REC-2955", entityId: "ent-norte", property: "Edificio Arenales 2210", invoiceIds: ["F-0045"], riskTier: "Medio", score: 40, reasonCode: "ANTIGUEDAD", reasonText: "Plan de pago acordado, seguimiento mensual", recommendedAction: "Confirmar próxima cuota", status: "en_curso" },
  { id: "REC-2750", entityId: "ent-palermo", property: "Consorcio Sarmiento 745", invoiceIds: ["F-0061", "F-0062"], riskTier: "Medio", score: 20, reasonCode: "SIN_RESPUESTA", reasonText: "Pago confirmado luego de seguimiento", recommendedAction: "Caso cerrado", status: "resuelto" },
];

const promises: PromiseRecord[] = [
  { id: "prom-1", caseId: "REC-2841", amountCents: 60000000, promisedDate: "2026-08-22", status: "vencida" },
  { id: "prom-2", caseId: "REC-3020", amountCents: 41000000, promisedDate: "2026-09-01", status: "vence_hoy" },
];

const disputes: DisputeRecord[] = [
  { id: "dis-1", caseId: "REC-2902", invoiceId: "F-0022", reason: "El cliente reclama un error de cálculo en el importe facturado", openedAt: "2026-08-10", status: "abierta" },
];

const paymentClaims: PaymentClaimRecord[] = [
  { id: "claim-1", caseId: "REC-3005", amountCents: 62000000, claimedAt: "2026-08-29", method: "Transferencia bancaria", status: "informado" },
];

const evidence: EvidenceItem[] = [
  { id: "ev-1", refId: "REC-2841", label: "Nota de seguimiento", kind: "nota", classification: "FACT", detail: "Promesa registrada por email el 22/08 por $600.000.", occurredAt: "2026-08-22" },
  { id: "ev-2", refId: "REC-2902", label: "Factura F-0022", kind: "documento", classification: "FACT", detail: "Documento original que el cliente disputa.", occurredAt: "2026-06-19" },
  { id: "ev-3", refId: "REC-2902", label: "Reclamo del cliente", kind: "registro", classification: "INFERENCE", detail: "El motivo del reclamo aún no fue verificado contra el detalle de obra.", occurredAt: "2026-08-10" },
  { id: "ev-4", refId: "REC-2918", label: "Dirección declarada", kind: "registro", classification: "UNKNOWN", detail: "La propiedad podría corresponder a otra administración; sin confirmación de tenencia.", occurredAt: "2026-07-02" },
  { id: "ev-5", refId: "REC-3005", label: "Comprobante informado", kind: "registro", classification: "INFERENCE", detail: "El cliente adjuntó una captura de transferencia; no concilia aún con el extracto bancario.", occurredAt: "2026-08-29" },
];

const timeline: TimelineEvent[] = [
  { id: "tl-1841-1", caseId: "REC-2841", label: "Caso priorizado por Recoveria", detail: "Motor Recoveria · regla de priorización", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-1841-2", caseId: "REC-2841", label: "Promesa de pago incumplida", detail: "Vencía el 22/08 por $600.000", occurredAt: "2026-08-23T08:00:00.000Z", kind: "evento" },
  { id: "tl-1841-3", caseId: "REC-2841", label: "Promesa de pago registrada", detail: "Nota de seguimiento", occurredAt: "2026-08-16T16:18:00.000Z", kind: "evento" },
  { id: "tl-1841-4", caseId: "REC-2841", label: "Último contacto por email", occurredAt: "2026-08-10T11:06:00.000Z", kind: "evento" },
  { id: "tl-1841-5", caseId: "REC-2841", label: "Factura F-0031 vencida", occurredAt: "2026-05-06T00:00:00.000Z", kind: "evento" },
  { id: "tl-2902-1", caseId: "REC-2902", label: "Caso priorizado por Recoveria", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-2902-2", caseId: "REC-2902", label: "Disputa registrada", detail: "Cobranza rutinaria pausada", occurredAt: "2026-08-10T00:00:00.000Z", kind: "evento" },
  { id: "tl-2918-1", caseId: "REC-2918", label: "Caso priorizado por Recoveria", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-2918-2", caseId: "REC-2918", label: "Identidad marcada para revisión", occurredAt: "2026-07-02T00:00:00.000Z", kind: "evento" },
  { id: "tl-3005-1", caseId: "REC-3005", label: "Caso priorizado por Recoveria", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-3005-2", caseId: "REC-3005", label: "Pago informado por el cliente", detail: "$620.000 por transferencia", occurredAt: "2026-08-29T00:00:00.000Z", kind: "evento" },
  { id: "tl-3012-1", caseId: "REC-3012", label: "Caso priorizado por Recoveria", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-3012-2", caseId: "REC-3012", label: "Sin respuesta al último contacto", occurredAt: "2026-08-05T00:00:00.000Z", kind: "evento" },
  { id: "tl-3020-1", caseId: "REC-3020", label: "Caso priorizado por Recoveria", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-3020-2", caseId: "REC-3020", label: "Promesa de pago registrada", detail: "$410.000 para el 1/9", occurredAt: "2026-08-18T00:00:00.000Z", kind: "evento" },
  { id: "tl-2798-1", caseId: "REC-2798", label: "Caso priorizado por Recoveria", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-2670-1", caseId: "REC-2670", label: "Caso priorizado por Recoveria", occurredAt: "2026-09-01T09:42:00.000Z", kind: "sistema" },
  { id: "tl-2955-1", caseId: "REC-2955", label: "Acuerdo de pago registrado", detail: "3 cuotas mensuales", occurredAt: "2026-08-01T00:00:00.000Z", kind: "decision" },
  { id: "tl-2750-1", caseId: "REC-2750", label: "Pago confirmado", detail: "$1.600.000 conciliados", occurredAt: "2026-08-27T00:00:00.000Z", kind: "decision" },
];

const notifications: NotificationItem[] = [
  { id: "not-1", kind: "promesa_vencida", label: "Promesa incumplida", detail: "Administración Centro SRL no cumplió la promesa del 22/08.", refType: "case", refId: "REC-2841", read: false, createdAt: "2026-08-23T08:00:00.000Z" },
  { id: "not-2", kind: "pago_pendiente", label: "Pago informado sin validar", detail: "Administración Plaza SRL informó una transferencia de $620.000.", refType: "case", refId: "REC-3005", read: false, createdAt: "2026-08-29T00:00:00.000Z" },
  { id: "not-3", kind: "disputa_nueva", label: "Nueva disputa", detail: "Administración Río SRL disputó la factura F-0022.", refType: "case", refId: "REC-2902", read: false, createdAt: "2026-08-10T00:00:00.000Z" },
  { id: "not-4", kind: "importacion_revision", label: "Importación requiere revisión", detail: "Extracto_bancario.pdf tiene movimientos sin conciliar.", refType: "import", refId: "imp-3", read: true, createdAt: "2026-08-31T00:00:00.000Z" },
];

const imports: ImportRecord[] = [
  { id: "imp-1", fileName: "Facturas_agosto.xlsx", status: "completada", itemsFound: 32, itemsReview: 0, createdAt: "2026-09-01T00:00:00.000Z" },
  { id: "imp-2", fileName: "Pagos_31-08.csv", status: "completada", itemsFound: 18, itemsReview: 0, createdAt: "2026-08-31T00:00:00.000Z" },
  { id: "imp-3", fileName: "Extracto_bancario.pdf", status: "revision", itemsFound: 46, itemsReview: 6, createdAt: "2026-08-31T00:00:00.000Z" },
];

export function seedState(): AppState {
  return {
    asOf: ASOF,
    entities: structuredClone(entities),
    invoices: structuredClone(invoices),
    cases: structuredClone(cases),
    promises: structuredClone(promises),
    disputes: structuredClone(disputes),
    paymentClaims: structuredClone(paymentClaims),
    drafts: [],
    evidence: structuredClone(evidence),
    timeline: structuredClone(timeline),
    notifications: structuredClone(notifications),
    imports: structuredClone(imports),
  };
}
