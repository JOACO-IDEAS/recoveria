import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Badge, date, money } from "@/components/ui";
import { attentionLabel, invoiceStatusLabel, ledgerLabel } from "@/lib/demo/presentation";
import { demoModel as m } from "@/lib/demo/product-model";

export default async function InvoiceDetail({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const invoice = m.invoices.find((item) => item.id === invoiceId);
  if (!invoice) notFound();
  const entries = m.cases.filter((item) => item.source.invoiceIds.includes(invoice.id));

  return <main className="page">
    <PageHeader eyebrow="FACTURA" title={invoice.invoiceNumber} description={`${invoice.entityName} · ${invoice.buildingName}`} />
    <div className="facts">
      <div className="fact"><span>Original</span><strong>{money(invoice.totalCents)}</strong></div>
      <div className="fact"><span>Pendiente</span><strong>{money(invoice.outstandingCents)}</strong></div>
      <div className="fact"><span>Vencimiento</span><strong>{date(invoice.dueAt)}</strong></div>
      <div className="fact"><span>Estado</span><strong><Badge tone={invoice.status.toLowerCase()}>{invoiceStatusLabel(invoice.status)}</Badge></strong></div>
    </div>
    <div className="detail-grid">
      <section className="section"><div className="section-title"><div><span>ASOCIACIÓN</span><h2>Por qué aparece aquí</h2></div></div>
        <p><strong>Administración:</strong> {invoice.entityName}</p><p><strong>Consorcio:</strong> {invoice.buildingName}</p>
        {invoice.reviewRequired && <div className="callout">La asociación requiere revisión: la evidencia no está confirmada.</div>}
        <details className="disclosure"><summary>Ver evidencia y movimientos</summary><p className="evidence">{invoice.evidenceRef}</p>
        <h3>Movimientos relevantes</h3>{invoice.ledgerEntries.map((entry) => <p key={entry.id}><strong>{ledgerLabel(entry.type)}</strong> · {money(entry.amountCents)}<br/><small>{date(entry.effectiveAt)} · {entry.evidenceRef}</small></p>)}</details>
      </section>
      <section className="section"><div className="section-title"><div><span>CASO</span><h2>Trabajo relacionado</h2></div></div>
        {entries.map((item) => <p key={item.id}><Link className="link" href={`/casos/${item.id}`}>Revisar caso</Link><br/><small>{attentionLabel(item.recommendation.attentionType)}</small></p>)}
      </section>
    </div>
  </main>;
}
