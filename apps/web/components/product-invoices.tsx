"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Filter, LoaderCircle, Search, UploadCloud } from "lucide-react";
import type { View } from "@/lib/view-types";
import { confidenceLabel, documentaryMoney, ProductSurfaceApiError, productSurfaceGet, type ExtractionConfidence, type ProductInvoice } from "@/lib/product-surface";

function candidateLabel(invoice: ProductInvoice): string {
  if (!invoice.entityCandidate.value) return "Entidad no identificada";
  return invoice.entityCandidate.classification === "FACT" ? "Entidad detectada" : invoice.entityCandidate.classification === "INFERENCE" ? "Posible entidad" : "Revisar entidad";
}

function duplicateLabel(value: ProductInvoice["duplicateStatus"]): string | null {
  return value === "EXACT_DOCUMENT_DUPLICATE" ? "Duplicado exacto" : value === "POSSIBLE_BUSINESS_DUPLICATE" ? "Posible duplicado" : null;
}

export function ProductInvoices({ onOpenInvoice, setView }: { onOpenInvoice: (id: string) => void; setView: (view: View) => void }) {
  const [rows, setRows] = useState<readonly ProductInvoice[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauthorized">("loading");
  const [q, setQ] = useState(""); const [reviewOnly, setReviewOnly] = useState(false); const [confidence, setConfidence] = useState<ExtractionConfidence | "">(""); const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController(); setStatus("loading");
    const parameters = new URLSearchParams(); if (q.trim()) parameters.set("search", q.trim()); if (reviewOnly) parameters.set("reviewRequired", "true"); if (confidence) parameters.set("confidence", confidence);
    const timer = window.setTimeout(() => productSurfaceGet<readonly ProductInvoice[]>(`invoices${parameters.size ? `?${parameters}` : ""}`, controller.signal).then((data) => { setRows(data); setStatus("ready"); }).catch((error) => { if (error instanceof DOMException && error.name === "AbortError") return; setRows([]); setStatus(error instanceof ProductSurfaceApiError && error.status === 401 ? "unauthorized" : "error"); }), 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [q, reviewOnly, confidence]);

  const countLabel = useMemo(() => status === "ready" ? `${rows.length} documento${rows.length === 1 ? "" : "s"}` : "Fuente conectada", [rows.length, status]);
  return <><div className="page-heading"><div><div className="eyebrow">DOCUMENTOS · PILOTO SINTÉTICO</div><h1>Facturas</h1><p>Valores documentados, evidencia y revisión desde la ingestión verificada.</p></div><button className="primary" onClick={() => setView("importaciones")}><UploadCloud size={17} /> Cargar factura</button></div>
    <section className="panel table-panel product-invoices">
      <div className="table-toolbar"><div className="search compact"><Search size={16} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar factura o entidad detectada…" aria-label="Buscar facturas" /></div><div className="filter-wrap"><button className="secondary" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><Filter size={16} /> Filtros{reviewOnly || confidence ? " activos" : ""}</button>{filtersOpen && <div className="filter-popover product-filter"><label><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /> Requiere revisión</label><label>Confianza<select value={confidence} onChange={(event) => setConfidence(event.target.value as ExtractionConfidence | "")}><option value="">Todas</option><option value="HIGH">Alta</option><option value="MEDIUM">Media</option><option value="LOW">Baja</option><option value="UNAVAILABLE">No disponible</option></select></label></div>}</div></div>
      <div className="product-source-note"><span><i /> Google Drive · Actualizado recientemente</span><span>{countLabel}</span></div>
      {status === "loading" && <div className="product-state" role="status"><LoaderCircle className="spin" size={22} /><strong>Cargando documentos verificados…</strong><span>Consultando el checkpoint sin ejecutar Drive.</span></div>}
      {status === "unauthorized" && <div className="product-state error" role="alert"><AlertCircle size={22} /><strong>Acceso no autorizado</strong><span>La sesión local no puede leer esta fuente documental.</span></div>}
      {status === "error" && <div className="product-state error" role="alert"><AlertCircle size={22} /><strong>No pudimos consultar la fuente documental</strong><span>No se muestran datos de demostración como reemplazo.</span></div>}
      {status === "ready" && <><table className="table-only"><thead><tr><th>Factura</th><th>Entidad / cliente</th><th>Fecha</th><th>Importe documentado</th><th>Revisión</th><th>Confianza</th><th /></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.documentId} className="clickable-row" onClick={() => onOpenInvoice(invoice.documentId)}><td><span className="invoice-id">{invoice.invoiceNumber.value ?? "Sin número"}</span><small>{invoice.source.displayName}</small></td><td><strong>{invoice.entityCandidate.value ?? "No identificado"}</strong><span className={invoice.entityCandidate.classification === "INFERENCE" ? "epistemic inference" : "epistemic"}>{candidateLabel(invoice)}</span></td><td>{invoice.issueDate.value ? new Intl.DateTimeFormat("es-AR").format(new Date(`${invoice.issueDate.value}T12:00:00`)) : "No identificada"}</td><td><strong>{documentaryMoney(invoice.documentedNominalTotalCents.value, invoice.currency.value)}</strong></td><td><span className={invoice.reviewStatus.required ? "review-chip" : "review-chip calm"}>{invoice.reviewStatus.required ? `Revisar · ${invoice.reviewStatus.reasonCount}` : "Sin revisión"}</span>{duplicateLabel(invoice.duplicateStatus) && <small className={invoice.duplicateStatus === "EXACT_DOCUMENT_DUPLICATE" ? "duplicate exact" : "duplicate possible"}>{duplicateLabel(invoice.duplicateStatus)}</small>}</td><td><span className={`product-confidence ${invoice.confidenceSummary.toLowerCase()}`}>{confidenceLabel[invoice.confidenceSummary]}</span></td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); onOpenInvoice(invoice.documentId); }} aria-label="Abrir evidencia del documento"><ArrowRight size={16} /></button></td></tr>)}</tbody></table>
        <div className="card-list">{rows.map((invoice) => <article className="row-card product-invoice-card" key={invoice.documentId} onClick={() => onOpenInvoice(invoice.documentId)} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpenInvoice(invoice.documentId)}><div className="row-card-top"><div><strong>{invoice.entityCandidate.value ?? "Entidad no identificada"}</strong><span>{candidateLabel(invoice)}</span></div><span className="invoice-id">{invoice.invoiceNumber.value ?? "Sin número"}</span></div><div className="row-card-money"><strong>{documentaryMoney(invoice.documentedNominalTotalCents.value, invoice.currency.value)}</strong><span className={invoice.reviewStatus.required ? "review-chip" : "review-chip calm"}>{invoice.reviewStatus.required ? "Revisar" : "Sin revisión"}</span></div><small>{invoice.source.displayName} · Confianza {confidenceLabel[invoice.confidenceSummary].toLowerCase()}</small></article>)}</div>
        {rows.length === 0 && <div className="product-state"><Search size={22} /><strong>No encontramos documentos</strong><span>Probá cambiar la búsqueda o los filtros activos.</span></div>}</>}
    </section>
  </>;
}
