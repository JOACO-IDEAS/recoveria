import { PageHeader } from "@/components/app-shell";
import { AgentConsole } from "@/components/agent-console";

export default function Agente() {
  return <main className="page operations">
    <PageHeader eyebrow="AGENTE" title="Agente RecoverIA" description="Preguntas operativas respondidas con evidencia de la cartera. No envía comunicaciones ni toma decisiones por su cuenta." />
    <AgentConsole />
    <p className="method-note">El Agente distingue hechos, inferencias y lo que todavía no se sabe. No decide verdad contable, destinatarios, estado legal ni acciones de cobranza.</p>
  </main>;
}
