"use client";
import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { casesForEntity, entityTotals, invoicesForEntity, money, statusLabelForInvoice, statusToneForInvoice } from "@/lib/selectors";
import { useEscapeKey } from "@/lib/use-escape";
import { ConfidenceTag, Risk, StatusPill } from "./badges";
import { EvidenceInspector } from "./evidence-inspector";

export function EntityDetail({ entityId, onClose, onOpenCase, onOpenInvoice }: { entityId: string; onClose: () => void; onOpenCase: (id: string) => void; onOpenInvoice: (id: string) => void }) {
  const { state } = useStore();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  useEscapeKey(() => evidenceOpen ? setEvidenceOpen(false) : onClose());
  const t = entityTotals(state).find((x) => x.entity.id === entityId);
  if (!t) return null;
  const cases = casesForEntity(state, entityId).filter((c) => c.status !== "resuelto");
  const invoices = invoicesForEntity(state, entityId);
  const evidence = cases.flatMap((c) => state.evidence.filter((e) => e.refId === c.id));

  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(e) => e.stopPropagation()}>
    {evidenceOpen ? <EvidenceInspector title={t.entity.name} items={evidence} onClose={() => setEvidenceOpen(false)} /> : <>
      <div className="drawer-head"><div><span>ADMINISTRACIÓN</span><h2>{t.entity.name}</h2><p>{t.entity.properties.join(" · ")}</p></div><button onClick={onClose} aria-label="Cerrar"><X size={19} /></button></div>
      <div className="drawer-stats"><div><span>Saldo documentado</span><strong>{money(t.outstandingCents)}</strong></div><div><span>Vencido</span><strong>{money(t.overdueCents)}</strong></div><div><span>Confianza</span><ConfidenceTag value={t.confidence} /></div></div>
      <section className="cw-section"><span className="cw-label">ACTIVIDAD</span><p className="quiet-note">{t.lastActivity ? `Última actividad: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(t.lastActivity))}.` : "Sin actividad reciente registrada."} {t.oldestDays > 0 ? `La factura más antigua tiene ${t.oldestDays} días de atraso.` : "No hay facturas vencidas."}</p></section>
      <section className="cw-section cw-evidence-row"><span className="cw-label">EVIDENCIA</span><button className="evidence-toggle" onClick={() => setEvidenceOpen(true)}>Ver {evidence.length} elemento{evidence.length === 1 ? "" : "s"} <ArrowRight size={13} /></button></section>
      <section className="cw-section"><span className="cw-label">CASOS ASOCIADOS</span>{cases.length === 0 && <p className="quiet-note">No hay casos activos para esta administración.</p>}{cases.map((c) => <button key={c.id} className="list-row-link" onClick={() => onOpenCase(c.id)}><div><strong>{c.property}</strong><span>{c.reasonText}</span></div><Risk level={c.riskTier} /></button>)}</section>
      <section className="cw-section"><span className="cw-label">FACTURAS</span>{invoices.map((i) => <button key={i.id} className="list-row-link" onClick={() => onOpenInvoice(i.id)}><div><strong>{i.id}</strong><span>{i.property}</span></div><div className="list-row-right"><strong>{money(i.outstandingCents || i.nominalAmountCents)}</strong><StatusPill tone={statusToneForInvoice(state, i)} label={statusLabelForInvoice(state, i)} /></div></button>)}</section>
    </>}
  </aside></div>;
}
