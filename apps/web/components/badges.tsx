import type { Confidence, RiskTier } from "@/lib/types";

export function Risk({ level }: { level: RiskTier }) {
  return <span className={"risk risk-" + level.toLowerCase().replace("í", "i")}><i />{level}</span>;
}

const confidenceLabel: Record<Confidence, string> = { documentado: "Documentado", reconstruido: "Reconstruido", aconfirmar: "A confirmar" };
export function ConfidenceTag({ value }: { value: Confidence }) {
  return <span className={"confidence-tag confidence-" + value}>{confidenceLabel[value]}</span>;
}

export function StatusPill({ tone, label }: { tone: "neutral" | "attention" | "dispute" | "promise" | "success"; label: string }) {
  return <span className={"status-pill status-" + tone}>{label}</span>;
}
