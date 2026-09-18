"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DocumentViewer } from "@/components/document-viewer";
import { date, money } from "@/components/ui";
import { buildDocumentExtraction } from "@/lib/demo/document-extraction";
import { demoModel as m } from "@/lib/demo/product-model";

type EvidenceContextValue = {
  openEvidence: (invoiceId: string, trigger?: HTMLElement | null) => void;
  closeEvidence: () => void;
};

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function EvidenceInspectorProvider({ children }: { children: React.ReactNode }) {
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  const closeEvidence = useCallback(() => {
    setInvoiceId(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openEvidence = useCallback((id: string, trigger?: HTMLElement | null) => {
    triggerRef.current = trigger ?? document.activeElement as HTMLElement | null;
    setInvoiceId(id);
  }, []);

  useEffect(() => {
    if (!invoiceId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEvidence();
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeEvidence, invoiceId]);

  const invoice = invoiceId ? m.invoices.find((item) => item.id === invoiceId) : undefined;
  return <EvidenceContext.Provider value={{ openEvidence, closeEvidence }}>
    {children}
    {invoice && <div className="evidence-inspector-layer">
      <button className="evidence-inspector-scrim" aria-label="Cerrar inspector de evidencia" onClick={closeEvidence} />
      <aside ref={dialogRef} className="evidence-inspector" role="dialog" aria-modal="true" aria-labelledby="evidence-inspector-title">
        <header className="evidence-inspector-head">
          <div>
            <span>DOCUMENTO ORIGINAL · DEMOSTRACIÓN</span>
            <h2 id="evidence-inspector-title">{invoice.invoiceNumber}</h2>
            <div className="evidence-inspector-meta"><time>{date(invoice.issuedAt)}</time><strong>{money(invoice.totalCents)}</strong><span>Importe nominal</span></div>
          </div>
          <button ref={closeRef} className="evidence-inspector-close" onClick={closeEvidence} aria-label="Cerrar inspector de evidencia">×</button>
        </header>
        <div className="evidence-inspector-body">
          <DocumentViewer extraction={buildDocumentExtraction(invoice)} invoiceNumber={invoice.invoiceNumber} inspector />
        </div>
        <footer className="evidence-inspector-foot">
          <p>El importe nominal del documento no representa necesariamente el saldo actual.</p>
          <Link href={`/facturas/${invoice.id}`}>Ver documento completo →</Link>
        </footer>
      </aside>
    </div>}
  </EvidenceContext.Provider>;
}

export function EvidenceReference({ invoiceId, children, className = "" }: { invoiceId: string; children: React.ReactNode; className?: string }) {
  const context = useContext(EvidenceContext);
  if (!context) throw new Error("EvidenceReference must be used inside EvidenceInspectorProvider");
  return <button className={`evidence-reference ${className}`.trim()} onClick={(event) => context.openEvidence(invoiceId, event.currentTarget)} aria-label={`Inspeccionar evidencia de ${String(children)}`}>
    <span aria-hidden>▱</span><span>{children}</span><span aria-hidden>↗</span>
  </button>;
}
