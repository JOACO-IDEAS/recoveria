import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { date, money } from "@/components/ui";
import { attentionLabel, evidenceLabel, invoiceStatusLabel, ledgerLabel } from "@/lib/demo/presentation";
import { demoModel as m } from "@/lib/demo/product-model";

export default async function InvoiceDetail({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const invoice = m.invoices.find((item) => item.id === invoiceId);
  if (!invoice) notFound();
  const entries = m.cases.filter((item) => item.source.invoiceIds.includes(invoice.id));

  return <main className="page editorial">
    <PageHeader eyebrow="FACTURA" title={invoice.invoiceNumber} description={`${invoice.entityName} · ${invoice.buildingName}`} />
    <div className="financial-summary"><div><span>SALDO PENDIENTE</span><strong>{money(invoice.outstandingCents)}</strong><small>de {money(invoice.totalCents)} originales</small></div><dl><div><dt>Vencimiento</dt><dd>{date(invoice.dueAt)}</dd></div><div><dt>Estado</dt><dd><span className={`process-state ${invoice.status.toLowerCase()}`}>{invoiceStatusLabel(invoice.status)}</span></dd></div></dl></div>
    <div className="detail-grid">
      <section className="section"><div className="section-title"><div><span>ASOCIACIÓN</span><h2>Por qué aparece aquí</h2></div></div>
        <p><strong>Administración:</strong> {invoice.administrationId?<Link className="link" href={`/cartera/${invoice.administrationId}`}>{invoice.entityName}</Link>:invoice.entityName}</p><p><strong>Consorcio:</strong> {invoice.buildingName}</p>
        {invoice.reviewRequired && <div className="callout">La asociación requiere revisión: la evidencia no está confirmada.</div>}
        <details className="disclosure evidence-panel"><summary>Ver evidencia y movimientos</summary><h3>Movimientos relevantes</h3>{invoice.ledgerEntries.map((entry) => <p key={entry.id}><strong>{ledgerLabel(entry.type)}</strong> · {money(entry.amountCents)}<br/><small>{date(entry.effectiveAt)}</small></p>)}<details className="raw-provenance"><summary>Ver procedencia original</summary><p>{evidenceLabel(invoice.evidenceRef)}</p>{invoice.ledgerEntries.map(entry=><p key={entry.id}>{evidenceLabel(entry.evidenceRef)}</p>)}</details></details>
      </section>
      <section className="section"><div className="section-title"><div><span>CASO</span><h2>Trabajo relacionado</h2></div></div>
        {entries.map((item) => <p key={item.id}><Link className="link" href={`/casos/${item.id}`}>Revisar caso</Link><br/><small>{attentionLabel(item.recommendation.attentionType)}</small></p>)}
      </section>
    </div>
  </main>;
}
