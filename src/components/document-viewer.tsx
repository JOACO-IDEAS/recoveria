"use client";
import { useState } from "react";
import type { DocumentExtraction, ExtractedField } from "@/lib/demo/document-extraction";

// Phase 4.7 — Document Viewer split view. The left panel is a CSS-drawn
// synthetic sheet, not a real scanned PDF and not an OCR animation: clicking
// an extracted field on the right simply highlights the matching mock
// region on the left, to make the FACT/INFERENCE/UNKNOWN distinction
// tangible without pretending RecoverIA re-ran extraction live.
const confidenceLabel: Record<ExtractedField["confidence"], string> = { FACT: "HECHO", INFERENCE: "INFERENCIA", UNKNOWN: "DESCONOCIDO" };

export function DocumentViewer({ extraction, invoiceNumber }: { extraction: DocumentExtraction; invoiceNumber: string }) {
  const [active, setActive] = useState<string | null>(null);
  const all = extraction.installmentNote ? [...extraction.fields, extraction.installmentNote] : extraction.fields;
  return <div className="document-viewer">
    <div className="document-mock">
      <div className="document-mock-sheet">
        <Region id="number" active={active} label={invoiceNumber} align="right" />
        <Region id="issued" active={active} className="mock-line short" />
        <Region id="cuit" active={active} className="mock-line medium" />
        <div style={{ height: 24 }} />
        <Region id="total" active={active} className="mock-line" style={{ height: 20 }} />
        <Region id="due" active={active} className="mock-line short" />
        <Region id="payment-status" active={active} className="mock-line short" />
        <Region id="balance" active={active} className="mock-line short" />
        {extraction.installmentNote && <Region id="installment" active={active} className="mock-line medium" />}
      </div>
      <p className="document-mock-caption">Representación sintética del documento · no es un PDF real</p>
    </div>
    <div className="extraction-panel">
      {all.map((field) => <div key={field.highlightId} className="extraction-field" onMouseEnter={() => setActive(field.highlightId)} onFocus={() => setActive(field.highlightId)} onClick={() => setActive(field.highlightId)} role="button" tabIndex={0}>
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
