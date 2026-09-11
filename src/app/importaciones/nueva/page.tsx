import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { IntelligentImportWorkspace } from "@/components/intelligent-import-workspace";
import { buildIntelligentImportScenarios } from "@/lib/demo/intelligent-import";

export default async function NuevaImportacion() {
  const scenarios = await buildIntelligentImportScenarios();
  return <main className="page import-page"><div className="back-row"><Link href="/importaciones">← Volver a importaciones</Link></div><PageHeader eyebrow="NUEVA IMPORTACIÓN" title="Importar facturas" description="Seleccioná un documento sintético y revisá cómo RecoverIA transforma evidencia en una factura controlada."/><IntelligentImportWorkspace scenarios={scenarios}/></main>;
}
