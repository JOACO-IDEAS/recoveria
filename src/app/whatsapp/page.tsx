import { PageHeader } from "@/components/app-shell";
import { WhatsAppSimulator } from "@/components/whatsapp-simulator";

export default function WhatsAppPage() { return <main className="page operations"><PageHeader eyebrow="WHATSAPP INTELLIGENCE · LOCAL" title="Simulador de conversaciones" description="Transforma mensajes ficticios en observaciones estructuradas y eventos candidatos. Nunca acredita ni concilia pagos automáticamente." /><WhatsAppSimulator /></main>; }
