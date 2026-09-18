import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { money, Priority } from "@/components/ui";
import { CaseDecisionPanel } from "@/components/case-decision-panel";
import { EvidenceReference } from "@/components/evidence-inspector";
import { attentionLabel, evidenceLabel, eventLabel, promiseLabel } from "@/lib/demo/presentation";
import { buildCommunicationPreview, decisionOptionsForCase, knowledgeGapsForCase, paymentClaimForCase } from "@/lib/demo/case-workspace";
import { demoModel as m } from "@/lib/demo/product-model";

export default async function CaseDetail({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const c = m.cases.find((x) => x.id === caseId);
  if (!c) notFound();
  const invoices = m.invoices.filter((i) => c.source.invoiceIds.includes(i.id));
  const claim = paymentClaimForCase(c.id);
  const { known, unknown } = knowledgeGapsForCase(c.id);
  const decisions = decisionOptionsForCase(c.id);
  const preview = decisions.some((d) => d.id === "PREPARE_FOLLOW_UP") ? buildCommunicationPreview(c.id) : undefined;

  return <main className="page editorial case-workspace">
    <div className="back-row"><Link href="/casos">← Volver a prioridades</Link>{c.administrationId && <Link href={`/cartera/${c.administrationId}`}>Ver administración →</Link>}</div>
    <PageHeader eyebrow="CASO" title={c.entityName} description={c.buildingName} />

    <section className="section recommendation">
      <div className="section-title"><div><span>RECOMENDACIÓN</span><h2>{attentionLabel(c.recommendation.attentionType)}</h2></div><Priority tier={c.recommendation.priorityTier} /></div>
      <p className="reason-lead">{c.recommendation.reasons[0]?.text}</p>
      <ul>{c.recommendation.reasons.slice(1).map((r) => <li key={r.code}>{r.text}</li>)}</ul>
      {c.recommendation.blockers.map((b) => <div className="callout" key={b.code}><strong>Antes de continuar</strong><span>{b.text}</span></div>)}
    </section>

    {c.dispute.value && <div className="pause-banner"><strong>Seguimiento pausado</strong><span>El seguimiento automático está detenido hasta revisión humana porque una factura de este caso está en disputa.</span></div>}

    {claim && <div className="state-card payment-claim">
      <h4>Pago informado — pendiente de verificación</h4>
      <p>{claim.note} No es un pago confirmado hasta que exista una imputación contra la evidencia bancaria.</p>
    </div>}

    {c.promise.value === "ACTIVE" && <div className="state-card promise"><h4>Promesa de pago activa</h4><p>Existe un compromiso de pago vigente. Evitar un seguimiento adicional antes de su vencimiento.</p></div>}
    {c.promise.value === "MISSED" && <div className="state-card dispute"><h4>Promesa de pago incumplida</h4><p>El compromiso de pago no se cumplió en la fecha estimada. Requiere verificación antes de continuar.</p></div>}

    <div className="financial-summary">
      <div><span>EXPOSICIÓN PENDIENTE</span><strong>{money(c.outstandingCents.value)}</strong></div>
      <dl>
        <div><dt>Facturas vencidas</dt><dd>{c.overdueInvoiceCount.value}</dd></div>
        <div><dt>Compromiso de pago</dt><dd>{promiseLabel(c.promise.value)}</dd></div>
        {c.dispute.value && <div className="case-fact critical"><dt>Situación</dt><dd>En disputa</dd></div>}
      </dl>
    </div>

    <div className="know-grid">
      <div className="know-panel"><h3>Qué sabe RecoverIA</h3><ul>{known.map((item) => <li key={item.text}><span aria-hidden>●</span>{item.text}</li>)}</ul></div>
      <div className="know-panel unknown"><h3>Qué no sabe RecoverIA</h3><ul>{unknown.map((item) => <li key={item.text}><span aria-hidden>◆</span>{item.text}</li>)}</ul></div>
    </div>

    <div className="detail-grid">
      <div className="stack">
        <section className="section">
          <div className="section-title"><div><span>HISTORIA</span><h2>Qué pasó hasta ahora</h2></div></div>
          <div className="timeline">
            {c.source.events.map((e) => <div key={e.id}><strong>{eventLabel(e.type)}</strong><p>{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(e.occurredAt))}</p></div>)}
            {claim && <div><strong>Pago informado por el cliente</strong><p>{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(claim.reportedAt))}</p></div>}
          </div>
          <details className="disclosure evidence-panel"><summary>Ver evidencia de la historia</summary><p>Fuentes de los eventos mostrados arriba.</p><details className="raw-provenance"><summary>Ver procedencia original</summary>{c.source.events.map((e) => <p key={e.id}>{evidenceLabel(e.evidenceRef)}</p>)}</details></details>
        </section>
      </div>
      <div className="stack">
        <section className="section">
          <div className="section-title"><div><span>FACTURAS</span><h2>Facturas involucradas</h2></div></div>
          {invoices.map((i) => <div className="list-row" key={i.id}><EvidenceReference invoiceId={i.id}>{i.invoiceNumber}</EvidenceReference><strong>{money(i.outstandingCents)}</strong></div>)}
        </section>
        <section className="section evidence-panel">
          <details className="disclosure"><summary>Ver evidencia de la recomendación</summary><p>La recomendación se apoya en saldo, vencimiento y señales del caso.</p><details className="raw-provenance"><summary>Ver procedencia original</summary>{c.recommendation.evidenceReferences.map((ref) => <p key={ref}>{evidenceLabel(ref)}</p>)}</details></details>
        </section>
        <CaseDecisionPanel decisions={decisions} preview={preview} />
      </div>
    </div>
  </main>;
}
