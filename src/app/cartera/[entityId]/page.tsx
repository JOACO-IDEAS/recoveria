import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { money, Priority } from "@/components/ui";
import { attentionLabel, invoiceStatusLabel } from "@/lib/demo/presentation";
import { balanceQualityExplanation, balanceQualityForEntity, balanceQualityLabel } from "@/lib/demo/case-workspace";
import { demoModel as m } from "@/lib/demo/product-model";

export default async function EntityDetail({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const entity = m.entities.find(item => item.id === entityId);
  if (!entity) notFound();
  const quality = balanceQualityForEntity(entity.id);
  return <main className="page editorial">
    <PageHeader eyebrow="ADMINISTRACIÓN" title={entity.displayName} description="Resumen de saldo, consorcios y documentación asociada."/>
    <div className="financial-summary"><div><span>EXPOSICIÓN PENDIENTE</span><strong>{money(entity.outstandingCents)}</strong></div><dl><div><dt>Vencido</dt><dd>{money(entity.overdueCents)}</dd></div><div><dt>Consorcios</dt><dd>{entity.buildings.length}</dd></div><div><dt>Contactos</dt><dd>{entity.contacts.length}</dd></div></dl></div>
    <div className="detail-grid"><div className="stack">
      <section className="section">
        <div className="section-title"><div><span>RECONSTRUCCIÓN</span><h2>Cómo se llegó a este saldo</h2></div><span className={`balance-quality ${quality.toLowerCase()}`}>{balanceQualityLabel[quality]}</span></div>
        <p className="quiet">{balanceQualityExplanation[quality]}</p>
        <div className="balance-breakdown">{entity.invoices.map(invoice => <div key={invoice.id}><Link className="link" href={`/facturas/${invoice.id}`}>{invoice.invoiceNumber}</Link><span className="quiet">{invoice.reviewRequired ? "No determinado" : invoice.status === "PARTIALLY_PAID" || invoice.status === "DISPUTED" ? "Reconstruido" : "Documentado"}</span><strong>{money(invoice.outstandingCents)}</strong></div>)}</div>
      </section>
      <section className="section"><div className="section-title"><div><span>FACTURAS</span><h2>Saldo asociado</h2></div></div>{entity.invoices.map(invoice => <div className="list-row" key={invoice.id}><div><Link className="link" href={`/facturas/${invoice.id}`}>{invoice.invoiceNumber}</Link><small>{invoice.buildingName}</small></div><strong>{money(invoice.outstandingCents)}</strong><span className={`process-state ${invoice.status.toLowerCase()}`}>{invoiceStatusLabel(invoice.status)}</span></div>)}</section>
      <section className="section"><div className="section-title"><div><span>CASOS ABIERTOS</span><h2>Situaciones para revisar</h2></div></div>{entity.cases.map(item => { const c = m.cases.find(candidate => candidate.id === item.id); return c ? <div className="list-row" key={c.id}><div><Link className="link" href={`/casos/${c.id}`}>{attentionLabel(c.recommendation.attentionType)}</Link><small>{c.buildingName}</small></div><strong>{money(c.outstandingCents.value)}</strong><Priority tier={c.recommendation.priorityTier}/></div> : null; })}</section>
    </div><section className="section"><div className="section-title"><div><span>RELACIONES</span><h2>Consorcios y contactos</h2></div></div>{entity.buildings.map(building => <p key={building.id}>{building.displayName}</p>)}{!entity.contacts.length ? <div className="callout"><strong>Falta información de contacto</strong><span>No hay un contacto disponible para esta administración.</span></div> : <p className="quiet">{entity.contacts.length} contacto{entity.contacts.length === 1 ? "" : "s"} disponible{entity.contacts.length === 1 ? "" : "s"}.</p>}<details className="disclosure"><summary>Información metodológica</summary><p>La administración, el consorcio y la responsabilidad legal se conservan como conceptos separados.</p></details></section></div>
  </main>;
}
