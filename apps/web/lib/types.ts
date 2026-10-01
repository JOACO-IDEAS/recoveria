// Recoveria V2.1 — synthetic domain model.
// This is the single source of truth for the showroom. Every screen derives
// its numbers from this state via lib/selectors.ts — nothing is hardcoded
// separately per component. Entirely local, no network, no persistence
// beyond the browser's own localStorage for demo continuity.

export type Confidence = "documentado" | "reconstruido" | "aconfirmar";
export type EvidenceClass = "FACT" | "INFERENCE" | "UNKNOWN";
export type RiskTier = "Crítico" | "Alto" | "Medio";
export type CaseStatus = "pendiente" | "en_curso" | "resuelto";
export type PromiseStatus = "vigente" | "vence_hoy" | "vencida" | "cumplida";
export type PaymentClaimStatus = "informado" | "confirmado" | "rechazado";
export type DraftStatus = "sugerido" | "aprobado_simulacion" | "descartado";
export type InvoiceStatus = "vigente" | "vencida" | "pagada_parcial" | "disputada" | "pagada";
export type ImportStatus = "procesando" | "completada" | "revision";

export interface Entity {
  readonly id: string;
  readonly name: string;
  readonly properties: readonly string[];
}

export interface Invoice {
  readonly id: string;
  readonly entityId: string;
  readonly property: string;
  readonly issueDate: string;
  readonly nominalAmountCents: number;
  readonly outstandingCents: number;
  readonly daysOverdue: number;
  readonly status: InvoiceStatus;
  readonly paidAt?: string;
  readonly disputeId?: string;
  readonly extraction: readonly { field: string; label: string; value: string; classification: EvidenceClass }[];
}

export interface CaseRecord {
  readonly id: string;
  readonly entityId: string;
  readonly property: string;
  readonly invoiceIds: readonly string[];
  readonly riskTier: RiskTier;
  readonly score: number;
  readonly reasonCode: "PROMESA_INCUMPLIDA" | "UMBRAL_LEGAL" | "ANTIGUEDAD" | "DISPUTA" | "IDENTIDAD" | "PAGO_INFORMADO" | "SIN_RESPUESTA" | "PROMESA_VENCE_HOY";
  readonly reasonText: string;
  readonly recommendedAction: string;
  status: CaseStatus;
  readonly disputeId?: string;
  readonly promiseId?: string;
  readonly paymentClaimId?: string;
  readonly identityUncertain?: boolean;
  identityDismissed?: boolean;
  infoConfirmed?: boolean;
  reviewRequested?: boolean;
}

export interface PromiseRecord {
  readonly id: string;
  readonly caseId: string;
  readonly amountCents: number;
  readonly promisedDate: string;
  status: PromiseStatus;
}

export interface DisputeRecord {
  readonly id: string;
  readonly caseId: string;
  readonly invoiceId: string;
  readonly reason: string;
  readonly openedAt: string;
  status: "abierta" | "resuelta";
}

export interface PaymentClaimRecord {
  readonly id: string;
  readonly caseId: string;
  readonly amountCents: number;
  readonly claimedAt: string;
  readonly method: string;
  status: PaymentClaimStatus;
}

export interface CommunicationDraft {
  readonly id: string;
  readonly caseId: string;
  readonly channel: "email" | "whatsapp";
  readonly subject: string;
  readonly body: string;
  status: DraftStatus;
  readonly createdAt: string;
}

export interface EvidenceItem {
  readonly id: string;
  readonly refId: string;
  readonly label: string;
  readonly kind: "documento" | "nota" | "registro";
  readonly classification: EvidenceClass;
  readonly detail: string;
  readonly occurredAt: string;
}

export interface TimelineEvent {
  readonly id: string;
  readonly caseId: string;
  readonly label: string;
  readonly detail?: string;
  readonly occurredAt: string;
  readonly kind: "sistema" | "decision" | "evento";
}

export interface NotificationItem {
  readonly id: string;
  readonly kind: "promesa_vencida" | "pago_pendiente" | "disputa_nueva" | "importacion_revision";
  readonly label: string;
  readonly detail: string;
  readonly refType: "case" | "import";
  readonly refId: string;
  read: boolean;
  readonly createdAt: string;
}

export interface ImportRecord {
  readonly id: string;
  readonly fileName: string;
  status: ImportStatus;
  readonly itemsFound: number;
  readonly itemsReview: number;
  readonly createdAt: string;
}

export interface AppState {
  readonly asOf: string;
  entities: Entity[];
  invoices: Invoice[];
  cases: CaseRecord[];
  promises: PromiseRecord[];
  disputes: DisputeRecord[];
  paymentClaims: PaymentClaimRecord[];
  drafts: CommunicationDraft[];
  evidence: EvidenceItem[];
  timeline: TimelineEvent[];
  notifications: NotificationItem[];
  imports: ImportRecord[];
}
