"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Building2, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, Cloud, FileDown, Filter, Gauge, Inbox, LayoutDashboard, LogOut, Menu, MoreHorizontal, Search, ShieldCheck, Sparkles, UploadCloud, WalletCards, FileText as FileTextIcon, X } from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { agingBuckets, casesByStatus, entityTotals, insight, invoicesForCase, money, priorityCases, recoveredThisMonth, riskCounts, totalOutstanding, totalOverdue, confidenceForCase } from "@/lib/selectors";
import { downloadCsv } from "@/lib/export-csv";
import type { View } from "@/lib/view-types";
import type { CaseRecord, CaseStatus } from "@/lib/types";
import { BrandLockup } from "@/components/logo";
import { ConfidenceTag, Risk } from "@/components/badges";
import { NotificationsBell, NotificationsPanel } from "@/components/notifications-panel";
import { CommandPalette } from "@/components/command-palette";
import { CaseWorkspace } from "@/components/case-workspace";
import { EntityDetail } from "@/components/entity-detail";
import { DocumentDetail } from "@/components/document-detail";
import { ImportsFlow } from "@/components/imports-flow";
import { AgentPanel } from "@/components/agent-panel";
import { AboutPanel } from "@/components/about-panel";
import { ProductInvoices } from "@/components/product-invoices";
import { ProductDocumentDetail } from "@/components/product-document-detail";
import { ConnectedSources } from "@/components/connected-sources";
import type { NotificationItem } from "@/lib/types";
import { FounderAuthGate, useFounderAuth } from "@/components/founder-auth-gate";

function Sidebar({ view, setView, open, setOpen, onAbout, onLogout }: { view: View; setView: (v: View) => void; open: boolean; setOpen: (v: boolean) => void; onAbout: () => void; onLogout: () => void }) {
  const items: [View, string, React.ElementType][] = [["inicio", "Resumen", LayoutDashboard], ["cartera", "Cartera", WalletCards], ["facturas", "Facturas", FileTextIcon], ["casos", "Casos prioritarios", Inbox], ["importaciones", "Importaciones", UploadCloud], ["agente", "Agente", Sparkles], ["fuentes", "Fuentes", Cloud]];
  const { state } = useStore();
  const pendingCount = casesByStatus(state, "pendiente").length;
  return <aside className={"sidebar " + (open ? "sidebar-open" : "")}>
    <div className="brand"><BrandLockup symbolSize={42} wordmarkSize={21} light /><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
    <div className="workspace"><span>Espacio de trabajo</span><div className="workspace-static"><div className="workspace-icon"><Building2 size={16} /></div><div><strong>Ascensores Horizonte</strong><small>Cuenta principal</small></div></div></div>
    <nav aria-label="Navegación principal"><span className="nav-label">Operación</span>{items.map(([id, label, Icon]) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => { setView(id); setOpen(false); }}><Icon size={18} /><span>{label}</span>{id === "casos" && pendingCount > 0 && <b>{pendingCount}</b>}</button>)}</nav>
    <div className="profile"><div className="avatar">JC</div><div><strong>Joaquín</strong><span>Administrador</span></div><button onClick={onAbout} aria-label="Acerca de Recoveria"><MoreHorizontal size={18} /></button><button onClick={onLogout} aria-label="Cerrar sesión"><LogOut size={17} /></button></div>
  </aside>;
}

function Topbar({ setOpen, onSearch, notifOpen, setNotifOpen, onSelectNotification }: { setOpen: (v: boolean) => void; onSearch: () => void; notifOpen: boolean; setNotifOpen: (v: boolean) => void; onSelectNotification: (n: NotificationItem) => void }) {
  return <header className="topbar">
    <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={21} /></button>
    <button className="search" onClick={onSearch} aria-label="Abrir búsqueda (Ctrl+K)"><Search size={17} /><span className="search-placeholder">Buscar cliente, factura o caso…</span><kbd>⌘ K</kbd></button>
    <div className="top-actions">
      <div className="data-state"><i /> Datos actualizados</div>
      <div className="notif-wrap"><NotificationsBell onOpen={() => setNotifOpen(!notifOpen)} /><NotificationsPanel open={notifOpen} setOpen={setNotifOpen} onSelect={onSelectNotification} /></div>
      <span className="period"><CalendarDays size={16} /> Septiembre 2026</span>
    </div>
  </header>;
}

function Metric({ label, value, detail, tone, delta, icon: Icon = CircleDollarSign }: { label: string; value: string; detail: string; tone?: string; delta?: string; icon?: React.ElementType }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><div className={"metric-icon " + (tone || "neutral")}><Icon size={16} /></div></div><strong>{value}</strong><div className="metric-detail">{delta && <span className="up"><ArrowUpRight size={13} />{delta}</span>}<span>{detail}</span></div></div>;
}

function Dashboard({ setView, onCase }: { setView: (v: View) => void; onCase: (c: CaseRecord) => void }) {
  const { state } = useStore();
  const outstanding = totalOutstanding(state), overdue = totalOverdue(state), recovered = recoveredThisMonth(state);
  const risk = riskCounts(state);
  const top = priorityCases(state).slice(0, 4);
  const ins = insight(state);
  const highRisk = priorityCases(state).filter((c) => c.riskTier !== "Medio").reduce((s, c) => s + invoicesForCase(state, c.id).reduce((a, i) => a + i.outstandingCents, 0), 0);
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Gauge size={14} /> CENTRO DE CONTROL</div><h1>Buen día, Joaquín</h1></div></div>
    <p className="hero-line">Tenés <b>{casesByStatusCount(state)} decisiones pendientes</b> y <b>{money(highRisk)}</b> concentrados en riesgo alto.</p>
    <section className="metrics"><Metric label="Cartera pendiente" value={money(outstanding)} detail={`${risk.critico} críticos · ${risk.alto} altos`} tone="blue" /><Metric label="Saldo vencido" value={money(overdue)} detail={`${Math.round((overdue / (outstanding || 1)) * 100)}% de la cartera`} tone="amber" icon={Clock3} /><Metric label="Recuperado este mes" value={money(recovered)} detail="pagos confirmados" tone="green" icon={CheckCircle2} /><Metric label="Casos para hoy" value={String(casesByStatusCount(state))} detail={`${risk.critico} críticos · ${risk.alto} altos`} tone="neutral" icon={Inbox} /></section>
    <section className="insight"><div className="insight-icon"><Sparkles size={19} /></div><div><span>INSIGHT DE RECOVERIA</span><strong>{ins.headline}</strong><p>{ins.detail}</p></div><button onClick={() => setView("casos")}>Ver estrategia <ArrowRight size={16} /></button></section>
    <div className="dashboard-grid">
      <section className="panel priorities"><div className="panel-head"><div><span className="kicker">PRÓXIMAS DECISIONES</span><h2>Prioridades de hoy</h2></div><button onClick={() => setView("casos")}>Ver todas <ArrowRight size={15} /></button></div><div className="priority-list">{top.map((c, i) => <button className="priority" key={c.id} onClick={() => onCase(c)}><div className="priority-rank">{String(i + 1).padStart(2, "0")}</div><div className="priority-main"><div><Risk level={c.riskTier} /><span className="case-id">{c.id}</span></div><strong>{c.property}</strong><span>{c.reasonText}</span><div className="priority-money-mobile"><strong>{money(invoicesForCase(state, c.id).reduce((s, i2) => s + i2.outstandingCents, 0))}</strong>{invoicesForCase(state, c.id).length} facturas</div></div><div className="priority-money"><strong>{money(invoicesForCase(state, c.id).reduce((s, i2) => s + i2.outstandingCents, 0))}</strong><span>{invoicesForCase(state, c.id).length} facturas</span></div><div className="arrow-box"><ArrowRight size={17} /></div></button>)}</div></section>
      <section className="panel"><div className="panel-head"><div><span className="kicker">EXPOSICIÓN</span><h2>Antigüedad de la cartera</h2></div><button onClick={() => setView("cartera")}>Ver detalle <ArrowRight size={15} /></button></div><div className="aging-total"><strong>{money(outstanding)}</strong><span>Saldo total pendiente</span></div><div className="aging-list">{agingBuckets(state).map((a, i) => <div className="aging-row" key={a.label}><span>{a.label}</span><div><i style={{ width: Math.max(2, a.pct * 2.7) + "%" }} className={i > 4 ? "danger" : i > 2 ? "warn" : ""} /></div><strong>{money(a.amountCents)}</strong><small>{a.pct}%</small></div>)}</div><div className="aging-foot"><ShieldCheck size={15} /> Los tramos concilian con el total de cartera.</div></section>
    </div>
  </>;
}
function casesByStatusCount(state: ReturnType<typeof useStore>["state"]) { return casesByStatus(state, "pendiente").length; }

function Portfolio({ onOpenEntity }: { onOpenEntity: (id: string) => void }) {
  const { state } = useStore();
  const [q, setQ] = useState(""); const [confidenceFilter, setConfidenceFilter] = useState<string | null>(null); const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"outstanding" | "overdue" | "invoices">("overdue");
  const rows = useMemo(() => {
    let list = entityTotals(state);
    if (q.trim()) list = list.filter((r) => r.entity.name.toLowerCase().includes(q.toLowerCase()));
    if (confidenceFilter) list = list.filter((r) => r.confidence === confidenceFilter);
    return [...list].sort((a, b) => sortKey === "outstanding" ? b.outstandingCents - a.outstandingCents : sortKey === "overdue" ? b.overdueCents - a.overdueCents : b.invoiceCount - a.invoiceCount);
  }, [state, q, confidenceFilter, sortKey]);
  const largest = rows[0];
  const exportCsv = () => downloadCsv("recoveria-cartera.csv", ["Administración", "Saldo pendiente", "Vencido", "Facturas", "Confianza"], rows.map((r) => [r.entity.name, r.outstandingCents / 100, r.overdueCents / 100, r.invoiceCount, r.confidence]));
  return <><div className="page-heading"><div><div className="eyebrow">CARTERA</div><h1>Exposición por cliente</h1><p>Concentración, antigüedad y confianza del saldo en una sola vista.</p></div><button className="secondary" onClick={exportCsv}><FileDown size={16} /> Exportar CSV</button></div>
    <section className="metrics three"><Metric label="Clientes con deuda" value={String(rows.length)} detail="con saldo pendiente" tone="neutral" /><Metric label="Ticket pendiente medio" value={money(rows.length ? Math.round(rows.reduce((s, r) => s + r.outstandingCents, 0) / rows.length) : 0)} detail="por administración" tone="neutral" /><Metric label="Mayor exposición" value={largest ? money(largest.outstandingCents) : "—"} detail={largest?.entity.name ?? ""} tone="blue" /></section>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="search compact"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar administración…" /></div>
        <div className="filter-wrap"><button className="secondary" onClick={() => setFilterOpen((v) => !v)}><Filter size={16} /> Filtros{confidenceFilter ? " (1)" : ""}</button>{filterOpen && <div className="filter-popover">
          <span>Confianza del saldo</span>
          {[["documentado", "Documentado"], ["reconstruido", "Reconstruido"], ["aconfirmar", "A confirmar"]].map(([val, label]) => <label key={val}><input type="checkbox" checked={confidenceFilter === val} onChange={() => setConfidenceFilter(confidenceFilter === val ? null : val)} /> {label}</label>)}
        </div>}</div>
      </div>
      <table className="table-only"><thead><tr><th>Administración</th><th><button className="sort-th" onClick={() => setSortKey("outstanding")}>Saldo pendiente</button></th><th><button className="sort-th" onClick={() => setSortKey("overdue")}>Vencido</button></th><th><button className="sort-th" onClick={() => setSortKey("invoices")}>Facturas</button></th><th>Confianza</th><th /></tr></thead><tbody>{rows.map((r) => <tr key={r.entity.id} className="clickable-row" onClick={() => onOpenEntity(r.entity.id)}><td><strong>{r.entity.name}</strong><span>{r.entity.properties.join(" · ")}</span></td><td><strong>{money(r.outstandingCents)}</strong></td><td>{money(r.overdueCents)}</td><td>{r.invoiceCount}</td><td><ConfidenceTag value={r.confidence} /></td><td><button className="row-action" onClick={(e) => { e.stopPropagation(); onOpenEntity(r.entity.id); }} aria-label="Abrir administración"><ArrowRight size={16} /></button></td></tr>)}</tbody></table>
      <div className="card-list">{rows.map((r) => <article className="row-card" key={r.entity.id} onClick={() => onOpenEntity(r.entity.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpenEntity(r.entity.id)}><div className="row-card-top"><div><strong>{r.entity.name}</strong><span>{r.entity.properties[0]}</span></div><ConfidenceTag value={r.confidence} /></div><div className="row-card-money"><strong>{money(r.outstandingCents)}</strong><span>{r.invoiceCount} facturas</span></div></article>)}</div>
      {rows.length === 0 && <p className="empty-state">No encontramos administraciones para "{q}".</p>}
    </section>
  </>;
}

function Cases({ onCase }: { onCase: (c: CaseRecord) => void }) {
  const { state } = useStore();
  const [filter, setFilter] = useState<CaseStatus>("pendiente");
  const rows = casesByStatus(state, filter);
  const tabs: [CaseStatus, string][] = [["pendiente", `Pendientes ${casesByStatus(state, "pendiente").length}`], ["en_curso", `En curso ${casesByStatus(state, "en_curso").length}`], ["resuelto", `Resueltos ${casesByStatus(state, "resuelto").length}`]];
  return <><div className="page-heading"><div><div className="eyebrow">BANDEJA DE TRABAJO</div><h1>Casos prioritarios</h1><p>Ordenados por impacto económico, riesgo y urgencia.</p></div><div className="segmented">{tabs.map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
    <section className="case-grid">{rows.map((c) => <button className="case-card" key={c.id} onClick={() => onCase(c)}><div className="case-card-top"><Risk level={c.riskTier} /><span>{c.id}</span></div><h3>{c.property}</h3><p>{state.entities.find((e) => e.id === c.entityId)?.name}</p><div className="case-score"><div><span>Prioridad Recoveria</span><strong>{c.score}<small>/100</small></strong></div><div className="score-ring" style={{ "--score": c.score * 3.6 + "deg" } as React.CSSProperties}><span>{c.score}</span></div></div><div className="case-amount"><span>Exposición pendiente</span><strong>{money(invoicesForCase(state, c.id).reduce((s, i) => s + i.outstandingCents, 0))}</strong></div><div className="case-reason"><span><b>{c.reasonText}</b><ConfidenceTag value={confidenceForCase(state, c)} /></span></div><div className="case-action">{c.recommendedAction}<ArrowRight size={17} /></div></button>)}</section>
    {rows.length === 0 && <p className="empty-state">No hay casos en este estado.</p>}
  </>;
}

function AppShell() {
  const { logout } = useFounderAuth();
  const { state } = useStore();
  const [view, setView] = useState<View>("inicio");
  const [menu, setMenu] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [openEntityId, setOpenEntityId] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [openProductInvoiceId, setOpenProductInvoiceId] = useState<string | null>(null);

  const titles: Record<View, string> = { inicio: "Resumen", cartera: "Cartera", facturas: "Facturas", casos: "Casos prioritarios", importaciones: "Importaciones", agente: "Agente", fuentes: "Fuentes conectadas" };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); } };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const openCase = (id: string) => { setOpenEntityId(null); setOpenInvoiceId(null); setOpenCaseId(id); };
  const openEntity = (id: string) => { setOpenCaseId(null); setOpenInvoiceId(null); setOpenEntityId(id); };
  const openInvoice = (id: string) => { setOpenCaseId(null); setOpenEntityId(null); setOpenInvoiceId(id); };

  const activeCase = openCaseId ? state.cases.find((c) => c.id === openCaseId) ?? null : null;

  const onSelectNotification = (n: NotificationItem) => { if (n.refType === "case") { setView("casos"); openCase(n.refId); } else { setView("importaciones"); } };

  return <div className="app-shell">
    <Sidebar view={view} setView={setView} open={menu} setOpen={setMenu} onAbout={() => setAboutOpen(true)} onLogout={() => void logout()} />
    <div className="app-main">
      <Topbar setOpen={setMenu} onSearch={() => setPaletteOpen(true)} notifOpen={notifOpen} setNotifOpen={setNotifOpen} onSelectNotification={onSelectNotification} />
      <main className="content">
        <div className="breadcrumb">Recoveria <span>/</span> {titles[view]}</div>
        {view === "inicio" && <Dashboard setView={setView} onCase={(c) => openCase(c.id)} />}
        {view === "cartera" && <Portfolio onOpenEntity={openEntity} />}
        {view === "facturas" && <ProductInvoices onOpenInvoice={setOpenProductInvoiceId} setView={setView} />}
        {view === "casos" && <Cases onCase={(c) => openCase(c.id)} />}
        {view === "importaciones" && <ImportsFlow />}
        {view === "agente" && <AgentPanel onOpenCase={openCase} onOpenEntity={openEntity} onOpenInvoice={openInvoice} />}
        {view === "fuentes" && <ConnectedSources setView={setView} />}
        <footer><span>Recoveria · Datos de demostración</span><span>Información al 1 de septiembre de 2026</span></footer>
      </main>
    </div>
    {menu && <div className="mobile-overlay" onClick={() => setMenu(false)} />}
    {activeCase && <CaseWorkspace caseItem={activeCase} onClose={() => setOpenCaseId(null)} onOpenInvoice={openInvoice} />}
    {openEntityId && <EntityDetail entityId={openEntityId} onClose={() => setOpenEntityId(null)} onOpenCase={openCase} onOpenInvoice={openInvoice} />}
    {openInvoiceId && <DocumentDetail invoiceId={openInvoiceId} onClose={() => setOpenInvoiceId(null)} onOpenEntity={openEntity} onOpenCase={openCase} />}
    {openProductInvoiceId && <ProductDocumentDetail documentId={openProductInvoiceId} onClose={() => setOpenProductInvoiceId(null)} />}
    <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} setView={setView} onOpenCase={openCase} onOpenEntity={openEntity} onOpenInvoice={openInvoice} />
    <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
  </div>;
}

export default function Home() {
  return <FounderAuthGate><StoreProvider><AppShell /></StoreProvider></FounderAuthGate>;
}
