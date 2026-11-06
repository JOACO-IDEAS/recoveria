"use client";
import { useState } from "react";
import type { ProcessingOutcome } from "@/modules/whatsapp-intelligence";

const simulatorScenarios = [
  ["pago-total", "Pago total"], ["pago-parcial", "Pago parcial"], ["promesa", "Promesa de pago"], ["incumplimiento", "Incumplimiento"],
  ["pago-parcial-comprobante", "Pago parcial con comprobante"],
  ["comprobante-duplicado", "Comprobante duplicado"], ["factura-no-identificada", "Factura no identificada"], ["dos-facturas", "Dos facturas similares"],
  ["deudor-ambiguo", "Deudor ambiguo"],
  ["disputa", "Disputa de deuda"], ["conversacion", "Conversación de varios mensajes"], ["webhook-repetido", "Webhook reenviado"],
] as const;

export function WhatsAppSimulator() {
  const [scenarioId, setScenarioId] = useState<string>(simulatorScenarios[0][0]); const [customMessage, setCustomMessage] = useState(""); const [result, setResult] = useState<{ scenario: string; outcomes: readonly ProcessingOutcome[] }>(); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const run = async () => { setPending(true); setError(""); try { const response = await fetch("/api/whatsapp/simulator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customMessage.trim() ? { customMessage } : { scenarioId }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setResult(body); } catch (value) { setError(value instanceof Error ? value.message : "SIMULATION_FAILED"); } finally { setPending(false); } };
  const outcome = result?.outcomes.at(-1); const interpreted = [...(result?.outcomes ?? [])].reverse().find(item => item.interpretation);
  return <section className="whatsapp-simulator">
    <div className="simulator-input"><label>Escenario<select value={scenarioId} onChange={event => { setScenarioId(event.target.value); setCustomMessage(""); }}>{simulatorScenarios.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><label>O escribí un mensaje ficticio<textarea value={customMessage} onChange={event => setCustomMessage(event.target.value)} placeholder="Ej.: Transferimos 500 mil de la factura 4567..." rows={4} /></label><button className="primary-button" onClick={run} disabled={pending}>{pending ? "Procesando…" : "Simular conversación"}</button><p className="method-note">Proveedor simulado · no llama a Meta, OpenAI ni a una base real.</p></div>
    {error && <div className="review-banner">Error seguro: {error}</div>}
    {result && <div className="simulator-results"><div className="simulator-result"><span>Mensaje original</span><strong>{interpreted?.message.text ?? "Adjunto sin texto"}</strong><small>ID: {interpreted?.message.metaMessageId}</small></div><div className="simulator-result"><span>Interpretación</span><strong>{interpreted?.interpretation?.interpretation.intent}</strong><pre>{JSON.stringify(interpreted?.interpretation?.interpretation, null, 2)}</pre></div><div className="simulator-result"><span>Evento candidato</span><strong>{interpreted?.event?.type}</strong><dl><div><dt>Factura CRM</dt><dd>{interpreted?.event?.invoiceIds.join(", ") || "No determinada"}</dd></div><div><dt>Acreditación</dt><dd>{interpreted?.event?.accreditationStatus}</dd></div><div><dt>Conciliación</dt><dd>{interpreted?.event?.reconciliationStatus}</dd></div><div><dt>Revisión</dt><dd>{interpreted?.event?.reviewRequired ? "Requerida" : "Pendiente de confirmación humana"}</dd></div></dl></div><div className="simulator-result"><span>Operaciones CRM simuladas</span><strong>{interpreted?.crmOperations?.length ?? 0} operaciones</strong><ul>{interpreted?.crmOperations?.map(operation => <li key={operation.operationId}><b>{operation.kind}</b> · {operation.status} · {operation.summary}<small>Impacto contable: {operation.accountingEffect}</small></li>)}</ul></div><div className="simulator-result"><span>Estado final</span><strong>{outcome?.duplicate ? "Duplicado ignorado" : interpreted?.event ? "Candidato preservado, sin impacto contable" : "Sin evento"}</strong><p>{[...(interpreted?.warnings ?? []), ...(outcome?.warnings ?? [])].join(" · ") || "Sin advertencias técnicas."}</p></div></div>}
  </section>;
}
