import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RECOVERIA_CRM_CONTRACT_VERSION, SyntheticRecoveriaCrmAdapter } from "./crm-adapter";
import { TransportRecoveriaCrmAdapter, type RecoveriaCrmApiRequest, type RecoveriaCrmTransport } from "./crm-api-contract";
import { synchronizeInterpretationWithCrm } from "./crm-orchestration";
import { MockConversationInterpreter, OpenAIConversationInterpreter } from "./interpreter";
import { parseMetaWebhook } from "./meta-webhook";
import { WhatsAppIntelligenceProcessor } from "./processor";
import { verifyMetaSignature, verifySubscription } from "./security";
import { runSimulation, simulatorScenarios, syntheticCrmSeed } from "./simulator";
import { InMemoryWhatsAppIntelligenceStore } from "./store";
import type { IncomingWhatsAppMessage } from "./types";

const message = (overrides: Partial<IncomingWhatsAppMessage> = {}): IncomingWhatsAppMessage => ({ organizationId: "synthetic-whatsapp-tenant", businessPhoneNumberId: "phone-1", metaMessageId: "wamid-1", senderPhone: "5491100000000", senderDisplayName: "Administración López", kind: "TEXT", text: "Transferimos 500 mil de la factura 4567. Los 350 mil restantes los pagamos el viernes.", receivedAt: "2026-11-04T12:00:00.000Z", payloadHash: "hash", ...overrides });
const limits = { maxInputCharacters: 24_000, maxContextMessages: 20, maxOutputTokens: 800, monthlyTokenLimit: 1_000_000, monthlyCostUsdMicrosLimit: 10_000_000 };
const syntheticCrm = () => new SyntheticRecoveriaCrmAdapter(syntheticCrmSeed);

describe("WhatsApp webhook security", () => {
  it("validates the exact raw body signature", () => { const body = new TextEncoder().encode('{"a":1}'); const secret = "secret"; const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`; expect(verifyMetaSignature(body, signature, secret)).toBe(true); expect(verifyMetaSignature(new TextEncoder().encode('{"a":2}'), signature, secret)).toBe(false); });
  it("verifies the Meta challenge token", () => { expect(verifySubscription("https://example.test/hook?hub.mode=subscribe&hub.verify_token=expected&hub.challenge=123", "expected")).toEqual({ ok: true, challenge: "123" }); expect(verifySubscription("https://example.test/hook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123", "expected").ok).toBe(false); });
  it("parses text and document metadata and derives tenant from the business number", async () => {
    const raw = new TextEncoder().encode(JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "phone-1" }, contacts: [{ wa_id: "54911", profile: { name: "López" } }], messages: [{ id: "wamid-text", from: "54911", timestamp: "1793793600", type: "text", text: { body: "Hola" } }, { id: "wamid-doc", from: "54911", timestamp: "1793793660", type: "document", document: { id: "media-1", mime_type: "application/pdf", filename: "pago.pdf" } }] } }] }] }));
    const parsed = await parseMetaWebhook(raw, { organizationForPhoneNumberId: async id => id === "phone-1" ? "org-1" : null });
    expect(parsed).toHaveLength(2); expect(parsed[0]).toMatchObject({ organizationId: "org-1", kind: "TEXT", text: "Hola" }); expect(parsed[1]).toMatchObject({ kind: "DOCUMENT", media: { mediaId: "media-1", filename: "pago.pdf" } });
  });
});

describe("interpretation and CRM synchronization", () => {
  it("keeps reported payment separate from accreditation and reconciliation", async () => { const input = message(); const result = await new MockConversationInterpreter().interpret({ organizationId: input.organizationId, senderPhone: input.senderPhone, messages: [input] }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsdMicros: 0 }); const synchronized = await synchronizeInterpretationWithCrm(input, result.interpretation, syntheticCrm()); expect(result.interpretation.intent).toBe("PAYMENT_PARTIAL_REPORTED"); expect(synchronized.event).toMatchObject({ type: "PAGO_PARCIAL_INFORMADO", invoiceIds: ["invoice-4567"], reportedAmountMinor: 50_000_000, remainingCommitmentMinor: 35_000_000, accreditationStatus: "PENDING", reconciliationStatus: "PENDING" }); expect(synchronized.operations.map(item => item.kind)).toEqual(["CONVERSATION_EVENT", "PAYMENT_REPORTED", "PAYMENT_PROMISE", "FOLLOW_UP_SCHEDULED"]); expect(synchronized.operations.every(item => item.accountingEffect === "NONE")).toBe(true); });
  it("uses the whole conversation context", async () => { const first = message({ metaMessageId: "one", text: "Consulto por la factura 4567." }); const second = message({ metaMessageId: "two", text: "Transferimos 500 mil; los 350 mil restantes los pagamos el viernes." }); const result = await new MockConversationInterpreter().interpret({ organizationId: first.organizationId, senderPhone: first.senderPhone, messages: [first, second] }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsdMicros: 0 }); expect(result.interpretation.invoiceReferences).toContain("4567"); expect(result.interpretation.evidenceMessageIds).toEqual(["one", "two"]); expect(result.interpretation.intent).toBe("PAYMENT_PARTIAL_REPORTED"); });
  it("rejects duplicate message ids without a second event", async () => { const store = new InMemoryWhatsAppIntelligenceStore(); const processor = new WhatsAppIntelligenceProcessor(store, new MockConversationInterpreter(), syntheticCrm(), { limits, maxAttempts: 3, retryBaseMs: 10 }); const input = message(); expect((await processor.receive(input)).duplicate).toBe(false); await processor.workOne(); const duplicate = await processor.receive(input); expect(duplicate.duplicate).toBe(true); expect(duplicate.warnings).toContain("DUPLICATE_MESSAGE_IGNORED"); });
});

describe("Recoveria CRM adapter v1", () => {
  it("enforces versioned, tenant-scoped and idempotent synthetic writes", async () => {
    const crm = syntheticCrm(); const context = { contractVersion: RECOVERIA_CRM_CONTRACT_VERSION, organizationId: "synthetic-whatsapp-tenant", requestId: "request-1", idempotencyKey: "whatsapp:wamid-1:conversation", source: "WHATSAPP" as const };
    const input = { messageId: "wamid-1", invoiceIds: ["invoice-4567"], interpretation: (await new MockConversationInterpreter().interpret({ organizationId: "synthetic-whatsapp-tenant", senderPhone: "5491100000000", messages: [message()] })).interpretation, evidenceRefs: ["whatsapp-message:wamid-1"] };
    expect((await crm.createConversationEvent(context, input)).status).toBe("SIMULATED"); expect((await crm.createConversationEvent(context, input)).status).toBe("DUPLICATE"); expect(crm.operations()).toHaveLength(1);
  });

  it("does not mutate the outstanding balance after a reported payment", async () => {
    const crm = syntheticCrm(); const context = { contractVersion: RECOVERIA_CRM_CONTRACT_VERSION, organizationId: "synthetic-whatsapp-tenant", requestId: "request-2", idempotencyKey: "balance-check", source: "WHATSAPP" as const };
    const before = await crm.getOutstandingBalance(context, "invoice-4567"); await crm.createPaymentReportedEvent({ ...context, idempotencyKey: "payment-check" }, { messageId: "wamid-1", debtorId: "party-lopez", invoiceId: "invoice-4567", amountMinor: 50_000_000, currency: "ARS", partial: true, accreditationStatus: "PENDING", reconciliationStatus: "PENDING" }); const after = await crm.getOutstandingBalance(context, "invoice-4567");
    expect(after).toEqual(before); expect(after?.amountMinor).toBe(85_000_000);
  });

  it("maps the adapter to a versioned host-supplied transport without inventing an endpoint", async () => {
    const requests: RecoveriaCrmApiRequest[] = []; const transport: RecoveriaCrmTransport = { execute: async <T>(request: RecoveriaCrmApiRequest) => { requests.push(request); return { contractVersion: RECOVERIA_CRM_CONTRACT_VERSION, requestId: request.requestId, ok: true, result: [{ id: "debtor-1", organizationId: request.organizationId, displayName: "Synthetic" }] as T }; } };
    const adapter = new TransportRecoveriaCrmAdapter(transport); const context = { contractVersion: RECOVERIA_CRM_CONTRACT_VERSION, organizationId: "org-1", requestId: "request-transport", idempotencyKey: "idempotent-transport", source: "WHATSAPP" as const };
    await expect(adapter.findDebtor(context, { senderPhone: "54911" })).resolves.toHaveLength(1); expect(requests[0]).toMatchObject({ contractVersion: RECOVERIA_CRM_CONTRACT_VERSION, organizationId: "org-1", operation: "debtor.find", idempotencyKey: "idempotent-transport" });
  });
});

describe("OpenAI adapter", () => {
  it("validates strict output and records tokens and estimated cost", async () => {
    const interpretation = (await new MockConversationInterpreter().interpret({ organizationId: "org", senderPhone: "1", messages: [message({ organizationId: "org" })] }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsdMicros: 0 })).interpretation;
    const http = vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(interpretation) }] }], usage: { input_tokens: 1_000, output_tokens: 100, total_tokens: 1_100 } }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    const provider = new OpenAIConversationInterpreter({ apiKey: "not-a-real-key", model: "configured-model", limits, inputUsdMicrosPerMillionTokens: 50_000, outputUsdMicrosPerMillionTokens: 400_000 }, http);
    const result = await provider.interpret({ organizationId: "org", senderPhone: "1", messages: [message({ organizationId: "org" })] }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsdMicros: 0 });
    expect(result.usage).toEqual({ inputTokens: 1_000, outputTokens: 100, totalTokens: 1_100, estimatedCostUsdMicros: 90 }); expect(http).toHaveBeenCalledOnce();
  });
  it("fails closed when the monthly budget is exhausted", async () => { const http = vi.fn() as unknown as typeof fetch; const provider = new OpenAIConversationInterpreter({ apiKey: "not-a-real-key", model: "configured-model", limits: { ...limits, monthlyTokenLimit: 10 }, inputUsdMicrosPerMillionTokens: 1, outputUsdMicrosPerMillionTokens: 1 }, http); await expect(provider.interpret({ organizationId: "org", senderPhone: "1", messages: [message({ organizationId: "org" })] }, { inputTokens: 10, outputTokens: 0, totalTokens: 10, estimatedCostUsdMicros: 0 })).rejects.toThrow("WHATSAPP_OPENAI_BUDGET_EXCEEDED"); expect(http).not.toHaveBeenCalled(); });
  it("rejects model evidence that is not part of the supplied conversation", async () => { const base = (await new MockConversationInterpreter().interpret({ organizationId: "org", senderPhone: "1", messages: [message({ organizationId: "org" })] })).interpretation; const poisoned = { ...base, evidenceMessageIds: ["invented-message"] }; const http = vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(poisoned) }] }], usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } }), { status: 200 })) as unknown as typeof fetch; const provider = new OpenAIConversationInterpreter({ apiKey: "not-a-real-key", model: "configured-model", limits, inputUsdMicrosPerMillionTokens: 1, outputUsdMicrosPerMillionTokens: 1 }, http); await expect(provider.interpret({ organizationId: "org", senderPhone: "1", messages: [message({ organizationId: "org" })] }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsdMicros: 0 })).rejects.toThrow("WHATSAPP_OPENAI_EVIDENCE_MISMATCH"); });
});

describe("simulation scenarios", () => {
  it("covers all required V1.1 scenarios", () => { expect(simulatorScenarios).toHaveLength(12); });
  it.each(simulatorScenarios.map(item => [item.id]))("runs %s without external providers", async scenarioId => { const result = await runSimulation({ scenarioId }); expect(result.outcomes.length).toBeGreaterThan(0); expect(result.outcomes.some(item => item.interpretation)).toBe(true); });
  it.each([
    ["pago-total", "PAGO_TOTAL_INFORMADO"], ["pago-parcial", "PAGO_PARCIAL_INFORMADO"], ["pago-parcial-comprobante", "PAGO_PARCIAL_INFORMADO"], ["promesa", "PROMESA_PAGO_INFORMADA"],
    ["incumplimiento", "INCUMPLIMIENTO_INFORMADO"], ["comprobante-duplicado", "COMPROBANTE_RECIBIDO"], ["disputa", "DISPUTA_INFORMADA"],
    ["conversacion", "PAGO_PARCIAL_INFORMADO"], ["webhook-repetido", "PAGO_TOTAL_INFORMADO"],
  ])("maps %s to %s", async (scenarioId, expectedType) => { const result = await runSimulation({ scenarioId }); const interpreted = [...result.outcomes].reverse().find(item => item.event); expect(interpreted?.event?.type).toBe(expectedType); });
  it("flags unknown and ambiguous invoice matches for review", async () => { for (const scenarioId of ["factura-no-identificada", "dos-facturas"]) { const result = await runSimulation({ scenarioId }); const event = result.outcomes.find(item => item.event)?.event; expect(event?.reviewRequired).toBe(true); expect(event?.invoiceIds).toEqual([]); } });
  it("flags ambiguous debtors through the CRM adapter", async () => { const result = await runSimulation({ scenarioId: "deudor-ambiguo" }); const outcome = result.outcomes.find(item => item.event); expect(outcome?.event?.reviewRequired).toBe(true); expect(outcome?.event?.warnings).toContain("CRM_DEUDOR_AMBIGUO"); expect(outcome?.crmOperations?.some(item => item.kind === "REVIEW_FLAGGED")).toBe(true); });
  it("ignores a webhook replay by message id", async () => { const result = await runSimulation({ scenarioId: "webhook-repetido" }); expect(result.outcomes.at(-1)).toMatchObject({ duplicate: true, warnings: ["DUPLICATE_MESSAGE_IGNORED"] }); });
});
