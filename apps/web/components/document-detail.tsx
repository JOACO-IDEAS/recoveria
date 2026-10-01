"use client";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import { money, statusLabelForInvoice, statusToneForInvoice } from "@/lib/selectors";
import { useEscapeKey } from "@/lib/use-escape";
import { StatusPill } from "./badges";

const classLabel: Record<string, string> = { FACT: "HECHO", INFERENCE: "INFERENCIA", UNKNOWN: "DESCONOCIDO" };

export function DocumentDetail({ invoiceId, onClose, onOpenEntity, onOpenCase }: { invoiceId: string; onClose: () => void; onOpenEntity: (id: string) => void; onOpenCase: (id: string) => void }) {
  const { state } = useStore();
  useEscapeKey(onClose);
  const invoice = state.invoices.find((i) => i.id === invoiceId);
  if (!invoice) return null;
  const entity = state.entities.find((e) => e.id === invoice.entityId);
  const relatedCase = state.cases.find((c) => c.invoiceIds.includes(invoice.id));

  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(e) => e.stopPropagation()}>
    <div className="drawer-head"><div><span>DOCUMENTO</span><h2>{invoice.id}</h2><p>{invoice.property}</p></div><button onClick={onClose} aria-label="Cerrar"><X size={19} /></button></div>
    <div className="drawer-stats"><div><span>Importe nominal</span><strong>{money(invoice.nominalAmountCents)}</strong></div><div><span>Saldo actual</span><strong>{invoice.status === "pagada" ? money(0) : money(invoice.outstandingCents)}</strong></div><div><span>Estado</span><StatusPill tone={statusToneForInvoice(state, invoice)} label={statusLabelForInvoice(state, invoice)} /></div></div>

    <section className="cw-section"><span className="cw-label">EXTRACCIÓN</span>
      <div className="extraction-list">{invoice.extraction.map((f) => <div className="extraction-row" key={f.field}>
        <span>{f.label}</span>
        <div><span className="extraction-value">{f.value}</span><span className={"confidence-tag confidence-ec-" + f.classification.toLowerCase()}>{classLabel[f.classification]}</span></div>
      </div>)}</div>
      <p className="quiet-note">El importe nominal no implica que exista un saldo actual pendiente: eso depende de la evidencia de pago disponible.</p>
    </section>

    <section className="cw-section"><span className="cw-label">ASOCIACIÓN</span>
      <p>Administración: {entity && <button className="link-inline" onClick={() => onOpenEntity(entity.id)}>{entity.name}</button>}</p>
      <p>Consorcio: {invoice.property}</p>
      {relatedCase && <button className="list-row-link" onClick={() => onOpenCase(relatedCase.id)}><div><strong>Caso {relatedCase.id}</strong><span>{relatedCase.reasonText}</span></div></button>}
    </section>
  </aside></div>;
}
