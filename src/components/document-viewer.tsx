"use client";
import { useState } from "react";
import type { DocumentExtraction, ExtractedField } from "@/lib/demo/document-extraction";

// Phase 4.7 — Document Viewer split view. The left panel is a CSS-drawn
// synthetic sheet, not a real scanned PDF and not an OCR animation: clicking
// an extracted field on the right simply highlights the matching mock
// region on the left, to make the FACT/INFERENCE/UNKNOWN distinction
// tangible without pretending RecoverIA re-ran extraction live.
const confidenceLabel: Record<ExtractedField["confidence"], string> = { FACT: "HECHO", INFERENCE: "INFERENCIA", UNKNOWN: "DESCONOCIDO" };

export function DocumentViewer({ extraction, invoiceNumber, inspector = false }: { extraction: DocumentExtraction; invoiceNumber: string; inspector?: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const [unknownMessage, setUnknownMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const all = extraction.installmentNote ? [...extraction.fields, extraction.installmentNote] : extraction.fields;
  const selectField = (field: ExtractedField) => {
    if (field.confidence === "UNKNOWN") {
      setActive(null);
      setUnknownMessage("No se encontró un dato explícito en el documento.");
      return;
    }
    setUnknownMessage(null);
    setActive(field.highlightId);
  };
  return <div className={`document-viewer ${inspector ? "inspector-viewer" : ""}`}>
    <div className="document-mock">
      {inspector && <div className="document-toolbar" aria-label="Controles de zoom"><button onClick={() => setZoom((value) => Math.max(75, value - 25))} aria-label="Alejar documento">−</button><output>{zoom}%</output><button onClick={() => setZoom((value) => Math.min(150, value + 25))} aria-label="Acercar documento">+</button><button onClick={() => setZoom(100)}>Ajustar</button></div>}
      <div className="document-scroll"><div className="document-mock-sheet" style={inspector ? { width: `${zoom}%` } : undefined}>
        <Region id="number" active={active} label={invoiceNumber} align="right" />
        <Region id="issued" active={active} className="mock-line short" />
        <Region id="cuit" active={active} className="mock-line medium" />
        <div style={{ height: 24 }} />
        <Region id="total" active={active} className="mock-line" style={{ height: 20 }} />
        {extraction.fields.find((field) => field.highlightId === "due")?.confidence !== "UNKNOWN" && <Region id="due" active={active} className="mock-line short" />}
        {extraction.installmentNote && <Region id="installment" active={active} className="mock-line medium" />}
      </div></div>
      <p className="document-mock-caption">Representación sintética del documento · no es un PDF real</p>
    </div>
    <div className="extraction-panel">
      {unknownMessage && <p className="unknown-source-note" role="status">{unknownMessage}</p>}
      {all.map((field) => <div key={field.highlightId} className={`extraction-field ${active === field.highlightId ? "selected" : ""}`} onMouseEnter={() => selectField(field)} onFocus={() => selectField(field)} onClick={() => selectField(field)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectField(field); } }} role="button" tabIndex={0}>
        <span>{field.label}</span>
        <div>
          <span className="extraction-value">{field.value}</span>
          <span className={`confidence-tag ${field.confidence.toLowerCase()}`}>{confidenceLabel[field.confidence]}</span>
          {field.note && <span className="extraction-note">{field.note}</span>}
        </div>
      </div>)}
    </div>
  </div>;
}

function Region({ id, active, label, className, align, style }: { id: string; active: string | null; label?: string; className?: string; align?: "right"; style?: React.CSSProperties }) {
  return <div className={`mock-region ${className ?? ""} ${active === id ? "highlighted" : ""}`} style={{ textAlign: align, ...style }}>{label}</div>;
}
