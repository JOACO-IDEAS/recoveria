import { sha256 } from "./security";
import { SyntheticRecoveriaCrmAdapter, type CrmDebtor, type CrmOutstandingBalance } from "./crm-adapter";
import { MockConversationInterpreter } from "./interpreter";
import { WhatsAppIntelligenceProcessor } from "./processor";
import { InMemoryWhatsAppIntelligenceStore } from "./store";
import { defaultUsageLimits } from "./configuration";
import type { CrmInvoiceCandidate, IncomingWhatsAppMessage, ProcessingOutcome, WhatsAppMessageKind } from "./types";

const organizationId = "synthetic-whatsapp-tenant";
export const syntheticInvoices: readonly CrmInvoiceCandidate[] = [
  { id: "invoice-4567", organizationId, caseId: "case-lopez", partyId: "party-lopez", partyName: "Administración López", invoiceNumber: "0001-00004567", currency: "ARS", outstandingMinor: 85_000_000 },
  { id: "invoice-4578", organizationId, caseId: "case-lopez", partyId: "party-lopez", partyName: "Administración López", invoiceNumber: "0001-00004578", currency: "ARS", outstandingMinor: 85_000_000 },
  { id: "invoice-7781", organizationId, caseId: "case-norte", partyId: "party-norte", partyName: "Consorcio Norte", invoiceNumber: "0001-00007781", currency: "ARS", outstandingMinor: 50_000_000 },
  { id: "invoice-7782", organizationId, caseId: "case-norte", partyId: "party-norte", partyName: "Consorcio Norte", invoiceNumber: "0001-00007782", currency: "ARS", outstandingMinor: 50_000_000 },
];
const syntheticDebtors: readonly CrmDebtor[] = [
  { id: "party-lopez", organizationId, displayName: "Administración López", phone: "5491100000000" },
  { id: "party-norte", organizationId, displayName: "Consorcio Norte", phone: "5491100000001" },
  { id: "party-central-norte", organizationId, displayName: "Administración Central Norte" },
  { id: "party-central-sur", organizationId, displayName: "Administración Central Sur" },
];
const syntheticBalances: readonly CrmOutstandingBalance[] = syntheticInvoices.map(item => ({ invoiceId: item.id, amountMinor: item.outstandingMinor ?? 0, currency: item.currency, authoritative: false, observedAt: "2026-11-04T12:00:00.000Z" }));
export const syntheticCrmSeed = {
  debtors: syntheticDebtors,
  invoices: syntheticInvoices.map(item => ({ id: item.id, organizationId: item.organizationId, debtorId: item.partyId, caseId: item.caseId, invoiceNumber: item.invoiceNumber, currency: item.currency })),
  balances: syntheticBalances,
} as const;

export interface SimulatorMessage { readonly id: string; readonly text?: string; readonly kind?: WhatsAppMessageKind; readonly mediaId?: string; readonly senderName?: string; readonly senderPhone?: string }
export interface SimulatorScenario { readonly id: string; readonly name: string; readonly messages: readonly SimulatorMessage[]; readonly resendLast?: boolean }

export const simulatorScenarios: readonly SimulatorScenario[] = [
  { id: "pago-total", name: "Pago total", messages: [{ id: "wamid-total", text: "Hola, pagamos 850 mil de la factura 4567.", senderName: "Administración López" }] },
  { id: "pago-parcial", name: "Pago parcial", messages: [{ id: "wamid-partial", text: "Hola, hoy transferimos 500 mil de la factura 4567. Los 350 mil restantes los pagamos el viernes.", senderName: "Administración López" }] },
  { id: "pago-parcial-comprobante", name: "Pago parcial con comprobante", messages: [{ id: "wamid-partial-receipt", text: "Hola, les mandamos el comprobante de $300.000 de la factura 4578. Los $550.000 restantes los pagamos el jueves.", kind: "DOCUMENT", mediaId: "media-partial-receipt", senderName: "Administración López" }] },
  { id: "promesa", name: "Promesa de pago", messages: [{ id: "wamid-promise", text: "Pagaremos la factura 4567 el 2026-11-13.", senderName: "Administración López" }] },
  { id: "incumplimiento", name: "Incumplimiento", messages: [{ id: "wamid-broken", text: "No pudimos pagar la factura 4567 en la fecha prometida.", senderName: "Administración López" }] },
  { id: "comprobante-duplicado", name: "Comprobante duplicado", messages: [{ id: "wamid-receipt", text: "Adjunto comprobante del pago de la factura 4567", kind: "DOCUMENT", mediaId: "media-receipt", senderName: "Administración López" }], resendLast: true },
  { id: "factura-no-identificada", name: "Factura no identificada", messages: [{ id: "wamid-no-invoice", text: "Transferimos 120 mil hoy.", senderName: "Contacto sin identificar", senderPhone: "5491100000098" }] },
  { id: "dos-facturas", name: "Dos facturas similares", messages: [{ id: "wamid-two", text: "Pagamos 500 mil de las facturas 7781 y factura 7782.", senderName: "Consorcio Norte", senderPhone: "5491100000001" }] },
  { id: "deudor-ambiguo", name: "Deudor ambiguo", messages: [{ id: "wamid-ambiguous-debtor", text: "Necesito hablar por el saldo pendiente.", senderName: "Administración Central", senderPhone: "5491100000099" }] },
  { id: "disputa", name: "Disputa de deuda", messages: [{ id: "wamid-dispute", text: "La factura 4567 no corresponde, el importe es incorrecto.", senderName: "Administración López" }] },
  { id: "conversacion", name: "Conversación de varios mensajes", messages: [{ id: "wamid-context-1", text: "Consulto por la factura 4567.", senderName: "Administración López" }, { id: "wamid-context-2", text: "Transferimos 500 mil y los 350 mil restantes los pagamos el viernes.", senderName: "Administración López" }] },
  { id: "webhook-repetido", name: "Webhook reenviado", messages: [{ id: "wamid-retry", text: "Pagamos 850 mil de la factura 4567.", senderName: "Administración López" }], resendLast: true },
];

function incoming(input: SimulatorMessage, index: number): IncomingWhatsAppMessage {
  const text = input.text ?? ""; const kind = input.kind ?? "TEXT";
  return { organizationId, businessPhoneNumberId: "synthetic-phone-id", metaMessageId: input.id, senderPhone: input.senderPhone ?? "5491100000000", senderDisplayName: input.senderName, kind, text,
    ...(input.mediaId ? { media: { mediaId: input.mediaId, mimeType: "application/pdf", filename: "comprobante.pdf" } } : {}), receivedAt: new Date(Date.UTC(2026, 10, 4, 12, index)).toISOString(), payloadHash: sha256(`${input.id}:${text}`) };
}

export async function runSimulation(input: { scenarioId?: string; customMessage?: string }): Promise<{ scenario: string; outcomes: readonly ProcessingOutcome[] }> {
  const scenario = input.customMessage?.trim() ? { id: "personalizado", name: "Mensaje personalizado", messages: [{ id: `wamid-custom-${sha256(input.customMessage).slice(0, 12)}`, text: input.customMessage, senderName: "Administración López" }] } : simulatorScenarios.find(item => item.id === input.scenarioId) ?? simulatorScenarios[0];
  const store = new InMemoryWhatsAppIntelligenceStore(); const crm = new SyntheticRecoveriaCrmAdapter(syntheticCrmSeed);
  const processor = new WhatsAppIntelligenceProcessor(store, new MockConversationInterpreter(), crm, { limits: defaultUsageLimits({}), maxAttempts: 3, retryBaseMs: 100 });
  const outcomes: ProcessingOutcome[] = [];
  for (const [index, value] of scenario.messages.entries()) { const message = incoming(value, index); await processor.receive(message); const worked = await processor.workOne(); if (worked.outcome) outcomes.push(worked.outcome); }
  if (scenario.resendLast) outcomes.push(await processor.receive(incoming(scenario.messages.at(-1)!, scenario.messages.length - 1)));
  return { scenario: scenario.name, outcomes };
}
