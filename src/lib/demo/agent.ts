// Phase 4.7 — Agente RecoverIA: a deterministic, local question matcher.
// No external AI API calls. Every answer is generated from demoModel plus
// the Phase 4.7 showroom overlays, and every answer explicitly distinguishes
// FACT / INFERENCE / UNKNOWN. This module never decides accounting truth,
// recipient, legal status, or a collection action on its own — it only
// explains what RecoverIA already knows and can prepare a draft for human
// review.
import { money } from "@/components/ui";
import { demoModel as m } from "@/lib/demo/product-model";
import { buildCommunicationPreview, paymentClaimForCase } from "@/lib/demo/case-workspace";

export interface AgentTurn {
  readonly id: string;
  readonly role: "user" | "agent";
  readonly text: string;
  readonly kind?: "text" | "portfolio" | "case-reason" | "payment" | "avoid-list" | "drafts";
  readonly caseIds?: readonly string[];
  readonly invoiceIds?: readonly string[];
}

export interface AgentAnswer {
  readonly text: string;
  readonly kind: NonNullable<AgentTurn["kind"]>;
  readonly caseIds?: readonly string[];
  readonly invoiceIds?: readonly string[];
}

const norm = (value: string) => value.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[̀-ͯ]/g, "");

function topRecoverable(limit = 3) {
  return [...m.entities].sort((a, b) => b.outstandingCents - a.outstandingCents).slice(0, limit);
}

function answerPortfolio(): AgentAnswer {
  const top = topRecoverable();
  const lines = top.map((e) => `${e.displayName}: ${money(e.outstandingCents)} pendientes (${e.invoices.filter((i) => i.reviewRequired).length ? "con facturas que aún requieren revisión — UNKNOWN parcial" : "FACT según ledger documentado"}).`);
  return { text: `Las administraciones con más saldo pendiente son:\n${lines.join("\n")}\n\nEsto es un HECHO (FACT) derivado del ledger documentado; no implica que todo ese monto sea cobrable de inmediato.`, kind: "portfolio" };
}

function answerWhyFirst(): AgentAnswer {
  const first = m.attention[0];
  if (!first) return { text: "Hoy no hay casos que requieran atención prioritaria.", kind: "text" };
  const c = m.cases.find((item) => item.id === first.caseId);
  const reason = first.reasons[0]?.text ?? "prioridad calculada por la política operativa";
  return { text: `${c?.entityName ?? "Este caso"} aparece primero porque: ${reason}. Esto es un HECHO (FACT) respaldado por evidencia (${first.evidenceReferences.length} referencias); la prioridad final es una recomendación, no una decisión automática.`, kind: "case-reason", caseIds: [first.caseId] };
}

function answerPayment(): AgentAnswer {
  const claim = m.attention.map((a) => paymentClaimForCase(a.caseId)).find(Boolean) ?? paymentClaimForCase("case-b02");
  if (!claim) return { text: "No hay pagos informados pendientes de validación en este momento.", kind: "text" };
  const c = m.cases.find((item) => item.id === claim.caseId);
  return {
    text: `Sobre el pago informado en ${c?.entityName ?? "este caso"}:\n- HECHO: el contacto informó una transferencia de ${money(claim.amountCents)} por ${claim.channel} el ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(claim.reportedAt))}.\n- DESCONOCIDO: todavía no existe una imputación bancaria confirmada contra las facturas abiertas.\n- Próxima revisión recomendada: validar contra la evidencia antes de continuar el seguimiento.`,
    kind: "payment",
    caseIds: [claim.caseId],
    invoiceIds: claim.invoiceIds,
  };
}

function answerAvoidContact(): AgentAnswer {
  const disputed = m.cases.filter((c) => c.dispute.value);
  const uncertain = m.cases.filter((c) => c.recommendation.attentionType === "REVIEW_ENTITY" || c.recommendation.attentionType === "ADD_CONTACT");
  const claims = m.cases.filter((c) => paymentClaimForCase(c.id));
  const legal = m.cases.filter((c) => c.recommendation.attentionType === "REVIEW_LEGAL_THRESHOLD");
  const ids = [...new Set([...disputed, ...uncertain, ...claims, ...legal].map((c) => c.id))];
  const lines = [
    disputed.length ? `${disputed.length} en disputa abierta (seguimiento de rutina pausado).` : null,
    uncertain.length ? `${uncertain.length} con identidad o contacto sin confirmar.` : null,
    claims.length ? `${claims.length} con un pago informado aún sin validar.` : null,
    legal.length ? `${legal.length} en revisión humana/legal (esto no es una acción legal iniciada).` : null,
  ].filter(Boolean);
  return { text: `No deberíamos contactar de forma rutinaria a estos casos hoy:\n${lines.join("\n")}\n\nEsto combina HECHOS (disputa, pago informado) con estados que requieren confirmación humana (identidad, revisión legal).`, kind: "avoid-list", caseIds: ids };
}

function answerPrepareFollowUps(): AgentAnswer {
  const targets = m.attention.filter((a) => a.attentionType === "FOLLOW_UP").slice(0, 3);
  if (!targets.length) return { text: "No hay casos sin respuesta que necesiten un borrador hoy.", kind: "text" };
  const drafts = targets.map((a) => buildCommunicationPreview(a.caseId)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  return { text: `Preparé ${drafts.length} borrador${drafts.length === 1 ? "" : "es"} de seguimiento para revisión humana. No se envió nada — cada borrador requiere aprobación y revalidación antes de cualquier envío real.`, kind: "drafts", caseIds: targets.map((a) => a.caseId) };
}

const rules: readonly { test: (q: string) => boolean; answer: () => AgentAnswer }[] = [
  { test: (q) => q.includes("mas plata") || q.includes("mas saldo") || q.includes("recuperar") || q.includes("portafolio") || q.includes("cartera"), answer: answerPortfolio },
  { test: (q) => q.includes("por que") && (q.includes("primero") || q.includes("prioridad")), answer: answerWhyFirst },
  { test: (q) => q.includes("pago") && (q.includes("sabemos") || q.includes("informad")), answer: answerPayment },
  { test: (q) => q.includes("no deberiamos contactar") || q.includes("no contactar") || q.includes("evitar contact"), answer: answerAvoidContact },
  { test: (q) => q.includes("prepara") && (q.includes("seguimiento") || q.includes("respuesta")), answer: answerPrepareFollowUps },
];

export function answerAgentQuestion(question: string): AgentAnswer {
  const q = norm(question);
  const match = rules.find((rule) => rule.test(q));
  if (match) return match.answer();
  return {
    text: "Puedo responder sobre dónde hay más saldo pendiente, por qué un caso aparece primero, qué sabemos de un pago informado, qué casos no deberíamos contactar hoy o preparar borradores de seguimiento. Elegí una de las preguntas sugeridas para ver una respuesta con evidencia.",
    kind: "text",
  };
}

export const suggestedQuestions: readonly string[] = [
  "¿Dónde tengo más plata para recuperar?",
  "¿Por qué este caso está primero?",
  "¿Qué sabemos de este pago?",
  "¿Qué casos no deberíamos contactar?",
  "Preparame el seguimiento de los casos sin respuesta.",
];
