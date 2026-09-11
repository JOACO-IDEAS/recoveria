"use client";

import { useMemo, useState } from "react";
import { Badge, date, money } from "@/components/ui";
import { canApproveScenario, type ImportScenario, type ReviewDecision } from "@/lib/demo/intelligent-import-types";

const steps = ["Documento", "Interpretación", "Revisión", "Resultado"] as const;
const statusLabel = { EXTRACTED: "Confirmado", UNCERTAIN: "Incierto", AMBIGUOUS: "Ambiguo", MISSING: "Ausente", UNSUPPORTED: "No compatible", FAILED: "Falló" } as const;
const decisionOptions: ReadonlyArray<{ value: ReviewDecision; label: string; detail: string }> = [
  { value: "ACCEPT_SUGGESTION", label: "Aceptar propuesta", detail: "Confirma la interpretación sugerida para esta sesión." },
  { value: "CHOOSE_CANDIDATE", label: "Elegir coincidencia", detail: "Selecciona explícitamente la entidad candidata." },
  { value: "LEAVE_UNRESOLVED", label: "Dejar sin resolver", detail: "Conserva la factura con la entidad pendiente." },
  { value: "REJECT", label: "Rechazar documento", detail: "Descarta esta importación de demostración." },
];

export function IntelligentImportWorkspace({ scenarios }: { scenarios: readonly ImportScenario[] }) {
  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? "");
  const [step, setStep] = useState(0);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [approved, setApproved] = useState(false);
  const scenario = useMemo(() => scenarios.find(item => item.id === selectedId) ?? scenarios[0], [scenarios, selectedId]);
  if (!scenario) return null;
  const requiresDecision = scenario.status !== "PARSED";
  const approvable = canApproveScenario(scenario, decision);
  const choose = (id: string) => { setSelectedId(id); setStep(0); setDecision(null); setApproved(false); };
  const continueTo = (next: number) => setStep(Math.max(0, Math.min(3, next)));

  return <div className="import-workspace">
    <nav className="import-steps" aria-label="Progreso de la importación">{steps.map((label, index) => <button key={label} className={step === index ? "active" : step > index ? "done" : ""} onClick={() => index <= step && continueTo(index)} disabled={index > step}><span>{step > index ? "✓" : index + 1}</span>{label}</button>)}</nav>
    <div className="import-layout">
      <aside className="scenario-panel"><span className="import-kicker">DOCUMENTOS AUTORIZADOS</span><h2>Biblioteca sintética</h2><p>Elegí un caso preparado. La carga de archivos reales está deshabilitada en esta demo.</p><div className="scenario-list">{scenarios.map(item => <button key={item.id} className={item.id === scenario.id ? "selected" : ""} onClick={() => choose(item.id)}><strong>{item.title}</strong><span>{item.fileName}</span></button>)}</div><div className="safety-note"><strong>Entorno seguro</strong><span>Solo datos sintéticos · sin proveedores externos · sin persistencia real</span></div></aside>
      <section className="import-stage" aria-live="polite">
        {step === 0 && <><StageTitle eyebrow="PASO 1" title="Confirmá el documento" text="Este archivo proviene del corpus sintético autorizado de RecoverIA."/><DocumentCard scenario={scenario}/><div className="stage-actions"><button className="primary-button" onClick={() => continueTo(1)}>Interpretar documento →</button></div></>}
        {step === 1 && <><StageTitle eyebrow="PASO 2" title="Interpretación trazable" text="El motor determinístico clasifica, extrae y normaliza sin completar silenciosamente lo que no sabe."/><Pipeline scenario={scenario}/>{scenario.invoice ? <InvoiceFields scenario={scenario}/> : <EmptyExtraction scenario={scenario}/>}<div className="stage-actions"><button className="secondary-button" onClick={() => continueTo(0)}>Atrás</button><button className="primary-button" onClick={() => continueTo(2)}>Revisar resultado →</button></div></>}
        {step === 2 && <><StageTitle eyebrow="PASO 3" title="Decisión humana" text={requiresDecision ? "Elegí cómo tratar la incertidumbre antes de incorporar la factura." : "La evidencia es consistente. Podés aprobar la factura tal como fue interpretada."}/><ReviewSummary scenario={scenario}/>{requiresDecision && scenario.invoice && scenario.status !== "FAILED" && <fieldset className="decision-grid"><legend>Decisión para esta sesión</legend>{decisionOptions.map(option => <label key={option.value} className={decision === option.value ? "selected" : ""}><input type="radio" name="decision" value={option.value} checked={decision === option.value} onChange={() => setDecision(option.value)}/><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</fieldset>}<div className="stage-actions"><button className="secondary-button" onClick={() => continueTo(1)}>Atrás</button>{scenario.status === "UNSUPPORTED" || scenario.status === "FAILED" || scenario.kind === "SCANNED" ? <button className="primary-button" onClick={() => { setApproved(false); continueTo(3); }}>Cerrar revisión →</button> : <button className="primary-button" disabled={!approvable} onClick={() => { setApproved(true); continueTo(3); }}>Aprobar importación →</button>}</div></>}
        {step === 3 && <ResultView scenario={scenario} approved={approved} decision={decision} onRestart={() => choose(scenario.id)}/>}
      </section>
    </div>
  </div>;
}

function StageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <header className="stage-title"><span>{eyebrow}</span><h2>{title}</h2><p>{text}</p></header>; }
function DocumentCard({ scenario }: { scenario: ImportScenario }) { return <article className="document-card"><div className="file-icon">{scenario.format.includes("PDF") ? "PDF" : scenario.format}</div><div><strong>{scenario.fileName}</strong><span>{scenario.title} · documento sintético</span></div><Badge tone="medium">Autorizado</Badge></article>; }
function Pipeline({ scenario }: { scenario: ImportScenario }) {
  const items = ["Clasificado", scenario.invoice ? "Extraído" : "Sin extracción", scenario.invoice ? "Normalizado" : "Derivado", scenario.status === "PARSED" ? "Listo" : "A revisión"];
  return <div className="pipeline">{items.map((item, index) => <div key={`${item}-${index}`} className={index === 3 && scenario.status !== "PARSED" ? "warning" : ""}><span>{index + 1}</span><strong>{item}</strong></div>)}</div>;
}
function EmptyExtraction({ scenario }: { scenario: ImportScenario }) { return <div className="import-alert"><strong>No se generaron campos de factura</strong><p>{scenario.explanation} El archivo original permanece como evidencia y no se inventó ningún valor.</p></div>; }
function InvoiceFields({ scenario }: { scenario: ImportScenario }) { const invoice = scenario.invoice!; const rows = [["Número", invoice.number], ["Importe", invoice.amountCents], ["Vencimiento", invoice.dueDate], ["Administración", invoice.administration]] as const; return <div className="field-review">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value.value === null ? "Sin propuesta" : label === "Importe" ? money(Number(value.value)) : label === "Vencimiento" ? date(String(value.value)) : String(value.value)}</strong><Badge tone={value.status === "EXTRACTED" ? "medium" : "review"}>{statusLabel[value.status]}</Badge><small>{value.raw ? `Origen: ${value.raw}` : "Sin valor en el documento"}</small></div>)}</div>; }
function ReviewSummary({ scenario }: { scenario: ImportScenario }) { return <div className={`review-banner ${scenario.status === "PARSED" ? "ok" : "warning"}`}><Badge tone={scenario.status === "PARSED" ? "medium" : "review"}>{scenario.status === "PARSED" ? "Lista para aprobar" : "Revisión requerida"}</Badge><h3>{scenario.title}</h3><p>{scenario.explanation}</p>{scenario.duplicate && <p><strong>{scenario.duplicate.kind === "EXACT_DOCUMENT_DUPLICATE" ? "Duplicado confirmado:" : "Posible duplicado:"}</strong> coincide con {scenario.duplicate.matchesDocumentId}.</p>}</div>; }
function ResultView({ scenario, approved, decision, onRestart }: { scenario: ImportScenario; approved: boolean; decision: ReviewDecision | null; onRestart: () => void }) { if (!approved) return <><StageTitle eyebrow="RESULTADO" title="Importación no incorporada" text="El documento quedó fuera de la cartera y no modificó ningún dato canónico."/><div className="result-mark muted">×</div><ReviewSummary scenario={scenario}/><button className="secondary-button" onClick={onRestart}>Probar otro criterio</button></>; const invoice = scenario.invoice!; return <><StageTitle eyebrow="RESULTADO" title="Factura disponible en esta sesión" text="La aprobación creó una vista aislada de demostración. La cartera y sus métricas permanecen intactas."/><div className="result-mark">✓</div><article className="imported-invoice"><div><span>FACTURA IMPORTADA · SESIÓN DEMO</span><h3>{String(invoice.number.value ?? "Número pendiente")}</h3><p>{String(invoice.issuer.value ?? "Emisor sin confirmar")}</p></div><strong>{invoice.amountCents.value === null ? "Importe pendiente" : money(Number(invoice.amountCents.value))}</strong><dl><div><dt>Vencimiento</dt><dd>{invoice.dueDate.value ? date(String(invoice.dueDate.value)) : "Sin resolver"}</dd></div><div><dt>Administración</dt><dd>{decision === "LEAVE_UNRESOLVED" ? "Entidad sin confirmar" : String(invoice.administration.value ?? "Sin resolver")}</dd></div><div><dt>Estado</dt><dd>Incorporada en sesión</dd></div></dl></article><div className="session-note"><strong>No persistente</strong><span>Al salir o recargar, esta factura desaparece. No afecta saldos, KPIs ni casos.</span></div><button className="secondary-button" onClick={onRestart}>Importar otro documento</button></>; }
