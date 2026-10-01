"use client";
import { ArrowLeft, ClipboardList, FileText, StickyNote } from "lucide-react";
import type { EvidenceClass, EvidenceItem } from "@/lib/types";

const kindIcon: Record<EvidenceItem["kind"], React.ElementType> = { documento: FileText, nota: StickyNote, registro: ClipboardList };
const classLabel: Record<EvidenceClass, string> = { FACT: "HECHO", INFERENCE: "INFERENCIA", UNKNOWN: "DESCONOCIDO" };
const classClass: Record<EvidenceClass, string> = { FACT: "fact", INFERENCE: "inference", UNKNOWN: "unknown" };

// Recoveria V2.1 — contextual Evidence Inspector. It replaces the current
// drawer body in place (never navigates to a separate page) and "Volver"
// restores exactly what was there before — the interaction model the real
// RecoverIA architecture will eventually formalize.
export function EvidenceInspector({ title, items, onClose }: { title: string; items: readonly EvidenceItem[]; onClose: () => void }) {
  return <div className="evidence-inspector">
    <div className="evidence-head">
      <button className="evidence-back" onClick={onClose} autoFocus><ArrowLeft size={15} /> Volver</button>
      <strong>Evidencia · {title}</strong>
    </div>
    <div className="evidence-body">
      {items.length === 0 && <p className="evidence-empty">No hay evidencia adicional registrada para este elemento.</p>}
      {items.map((item) => { const Icon = kindIcon[item.kind]; return <div className="evidence-card" key={item.id}>
        <div className="evidence-card-top"><span className="evidence-kind-icon"><Icon size={14} /></span><span className={"confidence-tag confidence-ec-" + classClass[item.classification]}>{classLabel[item.classification]}</span></div>
        <strong>{item.label}</strong>
        <p>{item.detail}</p>
        <span className="evidence-date">{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(item.occurredAt))}</span>
      </div>; })}
    </div>
  </div>;
}
