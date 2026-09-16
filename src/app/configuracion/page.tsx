import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { demoModel as m } from "@/lib/demo/product-model";

export default function Configuracion() {
  return <main className="page operations">
    <PageHeader eyebrow="CONFIGURACIÓN" title="Configuración" description="Información del espacio de trabajo y accesos secundarios." />
    <div className="config-grid">
      <div className="config-card">
        <h3>Espacio de trabajo</h3>
        <p>Datos de demostración generados íntegramente en el repositorio. No hay conexión a Client Zero, Concilia ni proveedores reales desde esta vista.</p>
        <dl>
          <div><dt>Organización</dt><dd>{m.organization.name}</dd></div>
          <div><dt>Información al</dt><dd>{new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(m.asOf))}</dd></div>
        </dl>
      </div>
      <div className="config-card">
        <h3>Importación de documentos</h3>
        <p>El flujo de importación inteligente permanece disponible como un espacio de trabajo separado, con documentos sintéticos autorizados únicamente.</p>
        <Link className="link" href="/importaciones">Ir a Importaciones →</Link>
      </div>
      <div className="config-card">
        <h3>Límite Client Zero</h3>
        <p>RecoverIA mantiene una verificación de seguridad previa (preflight) que impide que datos reales de Client Zero entren a rutas de demostración o de producto. Esta vista no consulta ni expone esa información.</p>
      </div>
    </div>
  </main>;
}
