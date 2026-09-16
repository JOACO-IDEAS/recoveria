import Link from "next/link";
import { AttentionCard, money } from "@/components/ui";
import { PageHeader } from "@/components/app-shell";
import { recentActivity, upcomingActions } from "@/lib/demo/case-workspace";
import { demoModel as m } from "@/lib/demo/product-model";

export default function Home() {
  const upcoming = upcomingActions();
  const activity = recentActivity();
  const activePromises = m.cases.filter((c) => c.promise.value === "ACTIVE").length;
  const activeCases = m.cases.filter((c) => c.recommendation.attentionType !== "NO_ACTION").length;
  const trackedCents = m.attention.reduce((sum, item) => sum + item.outstandingCents, 0);
  const recoveredCents = m.invoices.flatMap((invoice) => invoice.ledgerEntries).filter((entry) => entry.type === "PAYMENT").reduce((sum, entry) => sum - entry.amountCents, 0);

  return <main className="page editorial home-page">
    <PageHeader eyebrow="RECOVERIA / INICIO" title="Atención de hoy" description="Lo que RecoverIA priorizó a partir de la evidencia disponible, con lo que todavía no sabemos siempre visible." />
    <p className="inbox-question">¿Qué necesita mi atención hoy?</p>

    <section className="inbox-section">
      <div className="inbox-section-head">
        <div><h2>Requiere atención</h2><p>{m.attention.length} casos priorizados por evidencia, no solo por monto.</p></div>
        <Link href="/casos">Ver todos los casos <span aria-hidden>→</span></Link>
      </div>
      <div className="attention-grid">
        {m.attention.map((item) => <AttentionCard key={item.caseId} item={item} entity={m.cases.find((c) => c.id === item.caseId)?.entityName ?? "Entidad sin confirmar"} />)}
      </div>
    </section>

    <section className="inbox-section">
      <div className="inbox-section-head">
        <div><h2>Próximas acciones</h2><p>Casos con un siguiente paso claro que no requieren atención inmediata.</p></div>
        <Link href="/casos">Ver cartera de casos <span aria-hidden>→</span></Link>
      </div>
      <div className="upcoming-list">
        {upcoming.length ? upcoming.map((item) => <Link className="upcoming-row" key={item.caseId} href={`/casos/${item.caseId}`}>
          <div><strong>{item.entityName}</strong><small>{item.label}</small></div>
          <small>{item.buildingName}</small>
        </Link>) : <p className="quiet">No hay acciones adicionales pendientes hoy.</p>}
      </div>
    </section>

    <section className="inbox-section">
      <div className="inbox-section-head">
        <div><h2>Actividad reciente</h2><p>Decisiones y eventos registrados en los casos de la cartera.</p></div>
      </div>
      <div className="activity-list">
        {activity.map((entry) => <div className="activity-row" key={entry.id}>
          <time dateTime={entry.occurredAt}>{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(entry.occurredAt))}</time>
          <div><strong className={entry.tone !== "neutral" ? entry.tone : undefined}>{entry.label}</strong><p>{entry.entityName} · {entry.detail}</p></div>
        </div>)}
      </div>
    </section>

    <section className="inbox-section">
      <div className="inbox-section-head"><div><h2>Métricas de referencia</h2><p>Contexto secundario; no reemplazan la revisión de cada caso.</p></div></div>
      <div className="inbox-metrics">
        <div><span>Saldo bajo seguimiento</span><strong>{money(trackedCents)}</strong></div>
        <div><span>Casos activos</span><strong>{activeCases}</strong></div>
        <div><span>Promesas próximas</span><strong>{activePromises}</strong></div>
        <div><span>Recuperado este mes</span><strong>{money(recoveredCents)}</strong></div>
      </div>
    </section>
  </main>;
}
