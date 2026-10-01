"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, FileText, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { caseOutstanding, confidenceForCase, disputeForCase, draftsForCase, evidenceForCase, invoicesForCase, knownFacts, money, paymentClaimForCase, promiseForCase, timelineForCase, unknownFacts, whatHappened } from "@/lib/selectors";
import type { CaseRecord } from "@/lib/types";
import { EvidenceInspector } from "./evidence-inspector";
import { ConfidenceTag, Risk } from "./badges";

type Decision = { id: string; label: string; kind: "primary" | "secondary"; run: () => void };

export function CaseWorkspace({ caseItem, onClose, onOpenInvoice }: { caseItem: CaseRecord; onClose: () => void; onOpenInvoice: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [promiseForm, setPromiseForm] = useState(false);
  useEffect(() => { setEvidenceOpen(false); setFeedback(null); setPromiseForm(false); }, [caseItem.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (evidenceOpen) setEvidenceOpen(false); else onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [evidenceOpen, onClose]);

  const invoices = invoicesForCase(state, caseItem.id);
  const evidence = evidenceForCase(state, caseItem.id);
  const timeline = timelineForCase(state, caseItem.id);
  const dispute = disputeForCase(state, caseItem.id);
  const claim = paymentClaimForCase(state, caseItem.id);
  const promise = promiseForCase(state, caseItem.id);
  const drafts = draftsForCase(state, caseItem.id);
  const activeDraft = drafts.find((d) => d.status === "sugerido");
  const confidence = confidenceForCase(state, caseItem);
  const resolved = caseItem.status === "resuelto";

  const say = (msg: string) => { setFeedback(msg); window.setTimeout(() => setFeedback((cur) => cur === msg ? null : cur), 4200); };

  const decisions: Decision[] = [];
  if (!resolved) {
    if (dispute?.status === "abierta") {
      decisions.push({ id: "resolve-dispute", label: "Resolver disputa", kind: "primary", run: () => { dispatch({ type: "RESOLVE_DISPUTE", caseId: caseItem.id }); say("Disputa marcada como resuelta. El seguimiento de rutina puede continuar."); } });
    }
    if (claim?.status === "informado") {
      decisions.push({ id: "confirm-payment", label: "Confirmar pago", kind: "primary", run: () => { dispatch({ type: "CONFIRM_PAYMENT", caseId: caseItem.id }); say("Pago confirmado. El caso se cerró y el saldo se actualizó."); } });
      decisions.push({ id: "reject-claim", label: "Rechazar pago informado", kind: "secondary", run: () => { dispatch({ type: "REJECT_PAYMENT_CLAIM", caseId: caseItem.id }); say("Pago informado rechazado. El saldo permanece sin cambios."); } });
    }
    if (caseItem.identityUncertain && !caseItem.identityDismissed) {
      decisions.push({ id: "confirm-identity", label: "Confirmar identidad", kind: "primary", run: () => { dispatch({ type: "CONFIRM_INFO", caseId: caseItem.id }); say("Identidad confirmada por el operador."); } });
      decisions.push({ id: "dismiss-assoc", label: "Descartar asociación", kind: "secondary", run: () => { dispatch({ type: "DISMISS_ASSOCIATION", caseId: caseItem.id }); say("Asociación descartada. El caso se cerró."); } });
    }
    if (promise && (promise.status === "vence_hoy" || promise.status === "vigente")) {
      decisions.push({ id: "promise-fulfilled", label: "Registrar cumplimiento", kind: "primary", run: () => { dispatch({ type: "MARK_PROMISE_FULFILLED", caseId: caseItem.id }); say("Cumplimiento informado por el cliente. Queda pendiente de validación bancaria."); } });
    }
    if (promise?.status === "vencida") {
      decisions.push({ id: "new-promise", label: "Registrar nueva promesa", kind: "secondary", run: () => setPromiseForm(true) });
    }
    if (!promise && !claim && !caseItem.identityUncertain && !dispute) {
      decisions.push({ id: "register-promise", label: "Registrar promesa", kind: "secondary", run: () => setPromiseForm(true) });
    }
    if (!decisions.some((d) => d.kind === "primary")) {
      decisions.unshift({ id: "confirm-info", label: caseItem.infoConfirmed ? "Información confirmada" : "Confirmar información", kind: "primary", run: () => { dispatch({ type: "CONFIRM_INFO", caseId: caseItem.id }); say("Información confirmada por el operador."); } });
    }
    decisions.push({ id: "request-review", label: "Solicitar revisión", kind: "secondary", run: () => { dispatch({ type: "REQUEST_REVIEW", caseId: caseItem.id }); say("Se solicitó una revisión adicional para este caso."); } });
  }

  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer case-workspace" onClick={(e) => e.stopPropagation()}>
    {evidenceOpen ? <EvidenceInspector title={caseItem.property} items={evidence} onClose={() => setEvidenceOpen(false)} /> : <>
      <div className="drawer-head"><div><span>CASO {caseItem.id}</span><h2>{state.entities.find((e) => e.id === caseItem.entityId)?.name}</h2><p>{caseItem.property}</p></div><button onClick={onClose} aria-label="Cerrar"><X size={19} /></button></div>

      <section className="cw-section cw-quepaso"><span className="cw-label">QUÉ PASÓ</span><p>{whatHappened(state, caseItem)}</p></section>

      {dispute?.status === "abierta" && <div className="pause-banner"><AlertTriangle size={16} /><div><strong>Cobranza rutinaria pausada por disputa</strong><span>El seguimiento automático está detenido hasta que se resuelva la evidencia.</span></div></div>}

      <div className="drawer-stats"><div><span>Saldo pendiente</span><strong>{money(caseOutstanding(state, caseItem.id))}</strong></div><div><span>Facturas</span><strong>{invoices.length}</strong></div><div><span>Confianza</span><ConfidenceTag value={confidence} /></div></div>

      <section className="cw-section"><span className="cw-label">QUÉ SABEMOS</span><ul className="cw-list">{knownFacts(state, caseItem).map((f) => <li key={f}><span aria-hidden>●</span>{f}</li>)}</ul></section>
      <section className="cw-section cw-unknown"><span className="cw-label">QUÉ NO SABEMOS</span><ul className="cw-list">{unknownFacts(state, caseItem).map((f) => <li key={f}><span aria-hidden>◆</span>{f}</li>)}</ul></section>

      <section className="cw-section cw-evidence-row"><span className="cw-label">EVIDENCIA</span><button className="evidence-toggle" onClick={() => setEvidenceOpen(true)}>Ver {evidence.length || 0} elemento{evidence.length === 1 ? "" : "s"} <ArrowRight size={13} /></button></section>

      <div className="timeline">
        <span className="cw-label">HISTORIAL</span>
        <h3>Cronología</h3>
        {timeline.map((e, i) => <div className="timeline-item" key={e.id}><i className={i === 0 ? "current" : ""} /><div><strong>{e.label}</strong><span>{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(e.occurredAt))}{e.detail ? ` · ${e.detail}` : ""}</span></div></div>)}
        <div className="cw-invoice-links">{invoices.map((i) => <button key={i.id} className="cw-invoice-chip" onClick={() => onOpenInvoice(i.id)}><FileText size={12} /> {i.id}</button>)}</div>
      </div>

      <div className="recommendation"><div><Sparkles size={17} /> RECOMENDACIÓN RECOVERIA</div><h3>{caseItem.recommendedAction}</h3><p>{caseItem.reasonText}. La combinación de importe, antigüedad e historial ubica este caso entre las prioridades del día.</p><div className="confidence"><span>Confianza de la recomendación</span><strong>{caseItem.score}%</strong></div><div className="confidence-bar"><i style={{ width: caseItem.score + "%" }} /></div></div>

      {activeDraft && <div className="draft-card">
        <div className="draft-head"><span>BORRADOR DE SEGUIMIENTO</span><span className="draft-channel">{activeDraft.channel === "email" ? "Email" : "WhatsApp"}</span></div>
        <strong>{activeDraft.subject}</strong>
        <p>{activeDraft.body}</p>
        <div className="comm-safety-note">El envío real requiere revalidación inmediatamente antes de cruzar el límite del proveedor. Esta demo no envía nada.</div>
        <div className="drawer-actions" style={{ position: "static", padding: "12px 0 0" }}>
          <button className="primary" onClick={() => { dispatch({ type: "APPROVE_DRAFT", draftId: activeDraft.id }); say("Seguimiento aprobado — simulación. No se envió ningún mensaje real."); }}>Aprobar</button>
          <button className="secondary" onClick={() => dispatch({ type: "DISCARD_DRAFT", draftId: activeDraft.id })}>Descartar</button>
        </div>
      </div>}

      {promiseForm && <PromiseForm onCancel={() => setPromiseForm(false)} onSubmit={(amountCents, promisedDate) => { dispatch({ type: "REGISTER_PROMISE", caseId: caseItem.id, amountCents, promisedDate }); setPromiseForm(false); say("Promesa de pago registrada."); }} />}

      <section className="cw-section"><span className="cw-label">DECISIÓN HUMANA</span>
        {resolved ? <p className="quiet-note">Caso resuelto. No requiere una nueva decisión.</p> : <>
          <p className="quiet-note">Ninguna de estas acciones envía comunicaciones ni modifica saldos por sí sola salvo que se indique explícitamente.</p>
          <div className="decision-actions">
            {decisions.map((d) => <button key={d.id} className={d.kind === "primary" ? "primary" : "secondary"} onClick={d.run}>{d.label}</button>)}
            {!activeDraft && dispute?.status !== "abierta" && <button className="secondary" onClick={() => { dispatch({ type: "GENERATE_DRAFT", caseId: caseItem.id }); say("Borrador de seguimiento generado para revisión."); }}>Preparar seguimiento</button>}
          </div>
        </>}
        {feedback && <div className="decision-confirmation" role="status"><strong>Registrado en esta sesión</strong>{feedback}</div>}
      </section>
    </>}
  </aside></div>;
}

function PromiseForm({ onSubmit, onCancel }: { onSubmit: (amountCents: number, date: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("2026-09-08");
  return <form className="promise-form" onSubmit={(e) => { e.preventDefault(); const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100); if (cents > 0) onSubmit(cents, date); }}>
    <label>Monto prometido<input inputMode="numeric" placeholder="Ej: 400000" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
    <label>Fecha comprometida<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
    <div className="promise-form-actions"><button type="submit" className="primary">Registrar</button><button type="button" className="secondary" onClick={onCancel}>Cancelar</button></div>
  </form>;
}
