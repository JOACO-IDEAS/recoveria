"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Gauge } from "lucide-react";
import { useStore } from "@/lib/store";
import { answerAgent, emptyContext, nextContext, type AgentAnswer, type AgentContext } from "@/lib/agent";
import { money, statusLabelForInvoice } from "@/lib/selectors";
import { Risk } from "./badges";
import { LogoSymbol } from "./logo";

type Turn = { id: string; role: "user" | "agent"; text: string; answer?: AgentAnswer };
let turnId = 0;

const SUGGESTIONS: { label: string; question: string }[] = [
  { label: "¿Cuánto me deben hoy?", question: "¿Cuánto me deben hoy?" },
  { label: "Mayores deudores", question: "¿Quiénes son los mayores deudores?" },
  { label: "Mayor riesgo", question: "¿Dónde tengo mayor riesgo?" },
  { label: "Casos en disputa", question: "¿Qué casos están en disputa?" },
  { label: "Promesas vencidas", question: "¿Qué promesas están vencidas?" },
  { label: "Pagos por validar", question: "¿Qué pagos están pendientes de validar?" },
];

export function AgentPanel({ onOpenCase, onOpenEntity, onOpenInvoice }: { onOpenCase: (id: string) => void; onOpenEntity: (id: string) => void; onOpenInvoice: (id: string) => void }) {
  const { state } = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [context, setContext] = useState<AgentContext>(emptyContext);
  const [pending, setPending] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [turns]);

  const ask = (question: string) => {
    if (!question.trim()) return;
    const answer = answerAgent(state, question, context);
    setTurns((prev) => [...prev, { id: `t${(turnId += 1)}`, role: "user", text: question }, { id: `t${(turnId += 1)}`, role: "agent", text: answer.text, answer }]);
    setContext(nextContext(answer, context));
    setPending("");
  };

  return <>
    <div className="page-heading"><div><div className="eyebrow"><Gauge size={14} /> ASISTENTE</div><h1>Agente</h1><p>Preguntale a Recoveria sobre tu cartera usando lenguaje natural.</p></div></div>
    <div className="agent-shell">
      <div className="agent-log" ref={logRef} aria-live="polite">
        {turns.length === 0 && <div className="agent-empty">
          <div className="agent-empty-symbol"><LogoSymbol size={26} /></div>
          <strong>¿Sobre qué querés preguntar?</strong>
          <p>Las respuestas usan exactamente los mismos datos que Resumen, Cartera y Casos — no es un asistente genérico.</p>
          <div className="agent-suggestions">
            {SUGGESTIONS.map((s) => <button key={s.question} onClick={() => ask(s.question)}>{s.label}</button>)}
          </div>
        </div>}
        {turns.map((t) => t.role === "user"
          ? <div className="agent-msg user" key={t.id}><div className="agent-bubble">{t.text}</div></div>
          : <div className="agent-msg agent" key={t.id}>
              <div className="agent-avatar"><LogoSymbol size={15} /></div>
              <div className="agent-bubble">
                <p className="agent-answer-text">{t.text}</p>
                {t.answer && <AnswerBody answer={t.answer} onOpenCase={onOpenCase} onOpenEntity={onOpenEntity} onOpenInvoice={onOpenInvoice} />}
              </div>
            </div>)}
      </div>
      <form className="agent-input" onSubmit={(e) => { e.preventDefault(); ask(pending); }}>
        <input value={pending} onChange={(e) => setPending(e.target.value)} placeholder="Preguntale algo a Recoveria…" aria-label="Mensaje para el Agente Recoveria" />
        <button type="submit" disabled={!pending.trim()} aria-label="Enviar pregunta"><ArrowUp size={16} /></button>
      </form>
    </div>
  </>;
}

function AnswerBody({ answer, onOpenCase, onOpenEntity, onOpenInvoice }: { answer: AgentAnswer; onOpenCase: (id: string) => void; onOpenEntity: (id: string) => void; onOpenInvoice: (id: string) => void }) {
  const { state } = useStore();

  if (answer.caseIds?.length) {
    const rows = answer.caseIds.slice(0, 6).map((id) => state.cases.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
    if (!rows.length) return null;
    return <div className="agent-answer-rows">{rows.map((c) => {
      const outstanding = state.invoices.filter((i) => c.invoiceIds.includes(i.id)).reduce((s, i) => s + i.outstandingCents, 0);
      return <div className="agent-answer-row" key={c.id}>
        <div className="aar-main"><div className="aar-top"><Risk level={c.riskTier} /><span className="aar-id">{c.id}</span></div><strong>{c.property}</strong><span>{c.reasonText}</span></div>
        <div className="aar-side"><span className="aar-amount">{money(outstanding)}</span><button className="aar-action" onClick={() => onOpenCase(c.id)}>Ver caso <ArrowRight size={12} /></button></div>
      </div>;
    })}</div>;
  }

  if (answer.invoiceIds?.length) {
    const rows = answer.invoiceIds.slice(0, 8).map((id) => state.invoices.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);
    if (!rows.length) return null;
    return <div className="agent-answer-rows">{rows.map((inv) => <div className="agent-answer-row" key={inv.id}>
      <div className="aar-main"><strong>{inv.id}</strong><span>{statusLabelForInvoice(state, inv)}</span></div>
      <div className="aar-side"><span className="aar-amount">{money(inv.outstandingCents || inv.nominalAmountCents)}</span><button className="aar-action" onClick={() => onOpenInvoice(inv.id)}>Ver factura <ArrowRight size={12} /></button></div>
    </div>)}</div>;
  }

  if (answer.entityIds?.length) {
    const rows = answer.entityIds.slice(0, 8).map((id, i) => ({ entity: state.entities.find((e) => e.id === id), fact: answer.facts?.[i] })).filter((r): r is { entity: NonNullable<typeof r.entity>; fact: typeof r.fact } => !!r.entity);
    if (!rows.length) return null;
    return <div className="agent-answer-rows">{rows.map(({ entity, fact }) => <div className="agent-answer-row" key={entity.id}>
      <div className="aar-main"><strong>{entity.name}</strong><span>{entity.properties.join(" · ")}</span></div>
      <div className="aar-side">{fact && <span className="aar-amount">{fact.value}</span>}<button className="aar-action" onClick={() => onOpenEntity(entity.id)}>Ver cartera <ArrowRight size={12} /></button></div>
    </div>)}</div>;
  }

  if (answer.facts?.length) {
    return <div className="agent-fact-chips">{answer.facts.map((f) => <div className="agent-fact-chip" key={f.label}><span>{f.label}</span><strong>{f.value}</strong></div>)}</div>;
  }

  return null;
}
