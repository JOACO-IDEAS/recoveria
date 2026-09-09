import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Badge, date, money } from "@/components/ui";
import { agingLabel, filterOptions, invoiceStatusLabel } from "@/lib/demo/presentation";
import { demoModel as m } from "@/lib/demo/product-model";

export default async function Facturas({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const state = (await searchParams).estado ?? "ALL";
  const rows = m.invoices.filter((invoice) => state === "ALL" ? true : state === "REVIEW" ? invoice.reviewRequired : state === "OLDEST" ? invoice.aging === "365+" : invoice.status === state);

  return <main className="page">
    <PageHeader eyebrow="FACTURAS" title="Facturas" description="Consultá el estado, vencimiento y saldo pendiente de cada factura." />
    <div className="filters" aria-label="Filtrar facturas">{filterOptions.map(([value,label]) => <Link aria-current={state===value?"page":undefined} className={state===value?"active":""} href={`/facturas?estado=${value}`} key={value}>{label}</Link>)}</div>
    <div className="table-wrap table-only"><table><thead><tr><th>Factura</th><th>Administración</th><th>Consorcio</th><th>Emisión / vencimiento</th><th>Original</th><th>Pendiente</th><th>Antigüedad</th><th>Estado</th></tr></thead><tbody>
      {rows.map((invoice) => <tr key={invoice.id}><td><Link className="link" href={`/facturas/${invoice.id}`}>{invoice.invoiceNumber}</Link></td><td>{invoice.entityName}</td><td>{invoice.buildingName}</td><td><small>{date(invoice.issuedAt)}<br/>{date(invoice.dueAt)}</small></td><td>{money(invoice.totalCents)}</td><td><strong>{money(invoice.outstandingCents)}</strong></td><td>{agingLabel(invoice.aging)}</td><td><Badge tone={invoice.reviewRequired ? "review" : invoice.status.toLowerCase()}>{invoice.reviewRequired ? "Requiere revisión" : invoiceStatusLabel(invoice.status)}</Badge></td></tr>)}
    </tbody></table></div>
    <div className="card-list cards-only">
      {rows.map((invoice) => <Link className="row-card" href={`/facturas/${invoice.id}`} key={invoice.id}>
        <div className="row-card-top"><h3>{invoice.invoiceNumber}</h3><Badge tone={invoice.reviewRequired ? "review" : invoice.status.toLowerCase()}>{invoice.reviewRequired ? "Requiere revisión" : invoiceStatusLabel(invoice.status)}</Badge></div>
        <span>{invoice.entityName}</span><small>{invoice.buildingName}</small>
        <strong className="amount">{money(invoice.outstandingCents)} <small>pendiente</small></strong>
        <div className="row-card-meta"><span>Vence {date(invoice.dueAt)}</span><span>{agingLabel(invoice.aging)}</span></div>
      </Link>)}
    </div>
    <p className="method-note">La antigüedad describe el tiempo transcurrido desde el vencimiento; no determina por sí sola la validez de la deuda.</p>
  </main>;
}
