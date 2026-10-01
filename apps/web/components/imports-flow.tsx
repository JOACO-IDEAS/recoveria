"use client";
import { useRef, useState } from "react";
import { Check, Clock3, FileText, UploadCloud } from "lucide-react";
import { useStore } from "@/lib/store";

type Stage = "idle" | "processing" | "review" | "done";
type Candidate = { id: string; label: string; amount: string; confidence: "documentado" | "reconstruido" | "aconfirmar"; status: "pendiente" | "confirmado" | "rechazado" };

const DEMO_CANDIDATES: Candidate[] = [
  { id: "c1", label: "Factura F-9001 · Administración Centro SRL", amount: "$ 210.000", confidence: "documentado", status: "pendiente" },
  { id: "c2", label: "Factura F-9002 · Administración Norte SRL", amount: "$ 340.000", confidence: "documentado", status: "pendiente" },
  { id: "c3", label: "Factura F-9003 · administración sin confirmar", amount: "$ 128.500", confidence: "aconfirmar", status: "pendiente" },
  { id: "c4", label: "Nota de crédito · Administración Río SRL", amount: "$ 45.000", confidence: "reconstruido", status: "pendiente" },
];

export function ImportsFlow() {
  const { state, dispatch } = useStore();
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [importId, setImportId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const beginProcessing = (name: string, demo: boolean) => {
    setFileName(name); setIsDemo(demo); setStage("processing");
    const id = `imp-local-${Date.now()}`; setImportId(id);
    dispatch({ type: "START_IMPORT", fileName: name });
    window.setTimeout(() => {
      const set = DEMO_CANDIDATES.map((c) => ({ ...c }));
      setCandidates(set);
      const review = set.filter((c) => c.confidence === "aconfirmar").length;
      dispatch({ type: "COMPLETE_IMPORT", importId: id, itemsFound: set.length, itemsReview: review });
      setStage("review");
    }, 1100);
  };

  const onFiles = (files: FileList | null) => { const f = files?.[0]; if (f) beginProcessing(f.name, false); };
  const decide = (id: string, status: "confirmado" | "rechazado") => setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  const reset = () => { setStage("idle"); setFileName(null); setCandidates([]); setImportId(null); };
  const pendingReview = candidates.filter((c) => c.status === "pendiente" && c.confidence === "aconfirmar");

  return <>
    {stage === "idle" && <section className={"upload-zone" + (dragOver ? " drag-over" : "")}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}>
      <div className="upload-icon"><UploadCloud size={27} /></div>
      <h2>Arrastrá todas las facturas acá</h2>
      <p>Excel, CSV o PDF · Hasta 20 MB por archivo</p>
      <input ref={inputRef} type="file" hidden onChange={(e) => onFiles(e.target.files)} />
      <div className="import-cta-row">
        <button className="primary" onClick={() => inputRef.current?.click()}>Seleccionar archivos</button>
        <button className="secondary" onClick={() => beginProcessing("Ejemplo_demo.xlsx", true)}>Probar importación de ejemplo</button>
      </div>
      <span>Recoveria procesa localmente en esta demo — ningún archivo se sube a un servidor.</span>
    </section>}

    {stage === "processing" && <section className="upload-zone processing"><div className="upload-icon spin"><UploadCloud size={27} /></div><h2>Procesando {fileName}…</h2><p>Recoveria está detectando facturas, montos y administraciones.</p></section>}

    {stage === "review" && <section className="panel import-review">
      <div className="panel-head"><div><span className="kicker">RESULTADO</span><h2>Encontramos {candidates.length} elementos{pendingReview.length ? ` — ${pendingReview.length} requieren atención` : ""}</h2></div></div>
      {!isDemo && <p className="import-disclaimer">Vista previa simulada con fines de demostración — no se interpretó el contenido real de &ldquo;{fileName}&rdquo;.</p>}
      <div className="import-candidates">{candidates.map((c) => <div className={"import-candidate" + (c.confidence === "aconfirmar" ? " needs-review" : "")} key={c.id}>
        <div><strong>{c.label}</strong><span>{c.amount}</span></div>
        <span className={"confidence-tag confidence-" + c.confidence}>{c.confidence === "documentado" ? "Documentado" : c.confidence === "reconstruido" ? "Reconstruido" : "A confirmar"}</span>
        {c.status === "pendiente" ? <div className="import-candidate-actions"><button className="secondary small" onClick={() => decide(c.id, "rechazado")}>Rechazar</button><button className="primary small" onClick={() => decide(c.id, "confirmado")}>Confirmar</button></div> : <span className={"status-pill status-" + (c.status === "confirmado" ? "success" : "dispute")}>{c.status === "confirmado" ? "Confirmado" : "Rechazado"}</span>}
      </div>)}</div>
      <div className="stage-actions" style={{ marginTop: 16 }}><button className="secondary" onClick={reset}>Cancelar</button><button className="primary" disabled={candidates.some((c) => c.status === "pendiente")} onClick={() => setStage("done")}>Finalizar importación</button></div>
    </section>}

    {stage === "done" && <section className="panel import-review"><div className="panel-head"><div><span className="kicker">COMPLETADO</span><h2>Importación finalizada</h2></div></div>
      <p className="quiet-note">{candidates.filter((c) => c.status === "confirmado").length} elementos confirmados, {candidates.filter((c) => c.status === "rechazado").length} rechazados. Esta sesión no modificó la cartera real de la demo.</p>
      <button className="secondary" onClick={reset}>Importar otro archivo</button>
    </section>}

    <section className="panel recent">
      <div className="panel-head"><div><span className="kicker">ACTIVIDAD</span><h2>Importaciones recientes</h2></div></div>
      {state.imports.map((r) => <div className="import-row" key={r.id}>
        <div className="file-icon"><FileText size={18} /></div>
        <div><strong>{r.fileName}</strong><span>{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(r.createdAt))} · {r.itemsFound} registros</span></div>
        <span className={"import-status " + (r.status === "revision" ? "warning" : r.status === "procesando" ? "processing" : "")}>{r.status === "procesando" ? <Clock3 size={13} /> : r.status === "revision" ? <Clock3 size={13} /> : <Check size={13} />} {r.status === "completada" ? "Completada" : r.status === "revision" ? `Requiere revisión (${r.itemsReview})` : "Procesando"}</span>
      </div>)}
    </section>
  </>;
}
