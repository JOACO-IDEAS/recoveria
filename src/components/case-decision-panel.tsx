"use client";
import { useState } from "react";
import type { CommunicationPreview, HumanDecisionOption } from "@/lib/demo/case-workspace";

// Phase 4.7 — human decision workspace. Every action here only updates local
// React state for this browser session; nothing is persisted, no provider is
// called, and no financial truth is mutated. This is the "showroom" decision
// simulation described in docs/RECOVERIA-PHASE-4-7-PRODUCT-SURFACE-V1.md.
const confirmationText: Record<HumanDecisionOption["id"], string> = {
  REVIEW_EVIDENCE: "Se abrió la evidencia disponible para este caso. Ninguna decisión quedó registrada todavía.",
  CONFIRM: "Confirmación registrada en esta sesión (no persistente). El saldo del caso no cambia hasta que exista una imputación bancaria confirmada.",
  REJECT: "Rechazo registrado en esta sesión (no persistente). El saldo permanece sin cambios.",
  REQUEST_INFO: "Se simuló el envío de una solicitud de información al contacto. No se envió ningún mensaje real.",
  PREPARE_FOLLOW_UP: "Borrador de seguimiento preparado más abajo. Requiere aprobación humana y revalidación antes de cualquier envío real.",
};

export function CaseDecisionPanel({ decisions, preview }: { decisions: readonly HumanDecisionOption[]; preview?: CommunicationPreview }) {
  const [chosen, setChosen] = useState<HumanDecisionOption["id"] | null>(null);
  const showPreview = chosen === "PREPARE_FOLLOW_UP" && preview;
  return <section className="decision-panel">
    <span>DECISIÓN HUMANA</span>
    <h3>¿Cómo seguimos con este caso?</h3>
    <p className="quiet">Ninguna de estas acciones envía comunicaciones ni modifica saldos por sí sola.</p>
    <div className="decision-actions">
      {decisions.map((option) => <button key={option.id} className={chosen === option.id ? "primary" : ""} onClick={() => setChosen(option.id)} title={option.detail}>{option.label}</button>)}
    </div>
    {chosen && <div className="decision-confirmation"><strong>Registrado en esta sesión</strong>{confirmationText[chosen]}</div>}
    {showPreview && <CommunicationPreviewCard preview={preview!} />}
  </section>;
}

function CommunicationPreviewCard({ preview }: { preview: CommunicationPreview }) {
  const [body, setBody] = useState(preview.body);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"DRAFT" | "APPROVED" | "CANCELLED">("DRAFT");
  return <div className="comm-preview">
    <div className="comm-preview-head"><span>Vista previa de comunicación</span><span>{preview.channel === "EMAIL" ? "Canal: Email" : "Canal: WhatsApp"}</span></div>
    <div className="comm-preview-body">
      <div className="comm-field"><span>Destinatario</span><strong>{preview.recipientName}</strong><p className="quiet">{preview.recipientPoint}</p></div>
      <div className="comm-field"><span>Contexto autorizado</span><ul>{preview.authorizedContext.map((line) => <li key={line}>{line}</li>)}</ul></div>
      <div className="comm-field"><span>Borrador</span>{editing ? <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={{ width: "100%", font: "inherit", padding: 10, borderRadius: 5, border: "1px solid var(--line)" }} /> : <div className="comm-draft">{body}</div>}</div>
      <div className="comm-field"><span>Evidencia utilizada</span><ul>{preview.evidenceUsed.map((ref) => <li key={ref}>{ref}</li>)}</ul></div>
      <div className="comm-safety-note">El envío real requiere revalidar el estado actual del caso inmediatamente antes de cruzar el límite del proveedor. Esta demo no envía nada.</div>
      {status !== "DRAFT" && <div className="decision-confirmation"><strong>{status === "APPROVED" ? "Aprobado en esta sesión" : "Cancelado"}</strong>{status === "APPROVED" ? "Queda pendiente de revalidación y envío real fuera de esta demo. No se envió ningún mensaje." : "El borrador no continúa."}</div>}
    </div>
    <div className="comm-actions">
      <button className="primary" onClick={() => setStatus("APPROVED")} disabled={status !== "DRAFT"}>Aprobar</button>
      <button onClick={() => setEditing((v) => !v)} disabled={status !== "DRAFT"}>{editing ? "Terminar edición" : "Editar"}</button>
      <button onClick={() => setStatus("CANCELLED")} disabled={status !== "DRAFT"}>Cancelar</button>
    </div>
  </div>;
}
