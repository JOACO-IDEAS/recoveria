export const PRIMARY_NAVIGATION = [
  "Inicio", "Cartera", "Facturas", "Casos", "Contactos", "Importaciones", "Agente", "Configuración",
] as const;

export const AI_ALLOWED_ACTIONS = ["READ", "EXTRACT", "CLASSIFY", "MATCH", "EXPLAIN", "PRIORITIZE", "DRAFT", "PREPARE"] as const;
export const AI_PROHIBITED_ACTIONS = ["SEND", "THREATEN", "NEGOTIATE", "ACCEPT_PAYMENT_TERMS", "INITIATE_LEGAL_ACTION"] as const;

export type PrioritizationSignal =
  | "daysOverdue" | "outstandingAmount" | "invoiceAge" | "unpaidInvoiceCount"
  | "previousContactAttempts" | "promiseToPayStatus" | "lastInteractionAt"
  | "missingContactInformation" | "disputeStatus" | "configuredLegalReviewFlag";

export const PRIORITIZATION_SIGNALS: readonly PrioritizationSignal[] = [
  "daysOverdue", "outstandingAmount", "invoiceAge", "unpaidInvoiceCount",
  "previousContactAttempts", "promiseToPayStatus", "lastInteractionAt",
  "missingContactInformation", "disputeStatus", "configuredLegalReviewFlag",
];
