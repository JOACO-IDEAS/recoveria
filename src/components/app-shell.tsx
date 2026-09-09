"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [["/", "Inicio"], ["/cartera", "Cartera"], ["/facturas", "Facturas"], ["/casos", "Casos"], ["/importaciones", "Importaciones"]] as const;

export function AppShell({children}:{children:React.ReactNode}) {
  const pathname = usePathname();
  return <div className="app"><aside className="sidebar"><Link href="/" className="brand"><span className="brandmark">R</span><span>RecoverIA<small>Gestión de cobranzas</small></span></Link><nav aria-label="Navegación principal">{nav.map(([href,label]) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link href={href} key={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{label}</Link>; })}</nav><div className="tenant"><span>Espacio de trabajo</span><strong>Ascensores Horizonte</strong><small>Datos de demostración</small></div></aside><div className="workspace"><header className="topbar"><div><strong>RecoverIA</strong><span> · información al 1 de septiembre de 2026</span></div><span className="mode">Datos de demostración</span></header>{children}</div></div>;
}
export function PageHeader({eyebrow,title,description,aside}:{eyebrow:string;title:string;description:string;aside?:React.ReactNode}){return <header className="pagehead"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{aside}</header>}
