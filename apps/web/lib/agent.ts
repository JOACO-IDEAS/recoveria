import type { AppState } from "./types";
import { caseOutstanding, disputeForCase, insight, largestDebtors, money, openDisputes, overduePromises, pendingCases, pendingPaymentClaims, priorityCases, invoicesForEntity } from "./selectors";

// Recoveria V2.1 — deterministic Agent. This is NOT an LLM: it is a rule
// matcher over the exact same selectors every other screen uses, so its
// answers can never contradict Resumen/Cartera/Casos. No network call.

export interface AgentFact { readonly label: string; readonly value: string }
export interface AgentAnswer {
  readonly text: string;
  readonly facts?: readonly AgentFact[];
  readonly caseIds?: readonly string[];
  readonly entityIds?: readonly string[];
  readonly invoiceIds?: readonly string[];
}
export interface AgentContext { readonly lastCaseIds: readonly string[]; readonly lastEntityIds: readonly string[]; readonly lastInvoiceIds: readonly string[] }
export const emptyContext: AgentContext = { lastCaseIds: [], lastEntityIds: [], lastInvoiceIds: [] };

const norm = (v: string) => v.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[̀-ͯ]/g, "");

function howMuch(state: AppState): AgentAnswer {
  const outstanding = pendingCases(state).reduce((s, c) => s + caseOutstanding(state, c.id), 0);
  const total = largestDebtors(state, 100).reduce((s, t) => s + t.outstandingCents, 0);
  return { text: `Hoy hay ${money(total)} pendientes en total. De eso, ${money(outstanding)} está concentrado en los ${pendingCases(state).length} casos que Recoveria priorizó para revisión humana.`, facts: [{ label: "Cartera pendiente", value: money(total) }, { label: "En casos priorizados", value: money(outstanding) }] };
}

function biggestDebtors(state: AppState): AgentAnswer {
  const top = largestDebtors(state, 10);
  return { text: "Los mayores deudores son:", facts: top.map((t) => ({ label: t.entity.name, value: money(t.outstandingCents) })), entityIds: top.map((t) => t.entity.id) };
}

function biggestRisk(state: AppState): AgentAnswer {
  const i = insight(state);
  return { text: `${i.headline} ${i.detail}`, caseIds: i.targetCaseIds };
}

function needsAttention(state: AppState): AgentAnswer {
  const top = priorityCases(state).slice(0, 5);
  return { text: `Hay ${pendingCases(state).length} decisiones pendientes. Estas son las de mayor prioridad:`, caseIds: top.map((c) => c.id) };
}

function disputedCases(state: AppState): AgentAnswer {
  const disputes = openDisputes(state);
  if (!disputes.length) return { text: "No hay disputas abiertas en este momento." };
  const caseIds = disputes.map((d) => d.caseId);
  return { text: `Hay ${disputes.length} disputa(s) abierta(s), que pausan el seguimiento de rutina:`, caseIds };
}

function overduePromisesAnswer(state: AppState): AgentAnswer {
  const proms = overduePromises(state);
  if (!proms.length) return { text: "No hay promesas vencidas ni por vencer hoy." };
  const caseIds = proms.map((p) => p.caseId);
  return { text: `Hay ${proms.length} promesa(s) que requieren seguimiento:\n${proms.map((p) => { const c = state.cases.find((x) => x.id === p.caseId); return `- ${c?.property ?? p.caseId}: ${money(p.amountCents)}, estado "${p.status.replace("_", " ")}"`; }).join("\n")}`, caseIds };
}

function pendingPayments(state: AppState): AgentAnswer {
  const claims = pendingPaymentClaims(state);
  if (!claims.length) return { text: "No hay pagos informados esperando validación." };
  const caseIds = claims.map((c) => c.caseId);
  return { text: `Hay ${claims.length} pago(s) informado(s) sin confirmar contra evidencia bancaria:\n${claims.map((cl) => { const c = state.cases.find((x) => x.id === cl.caseId); return `- ${c?.property ?? cl.caseId}: ${money(cl.amountCents)} informado — DESCONOCIDO si ya se conciliará.`; }).join("\n")}`, caseIds };
}

function whyThisCase(state: AppState, caseId: string | undefined): AgentAnswer {
  if (!caseId) return { text: "No tengo un caso de referencia todavía. Pedime primero una lista de casos o decime cuál te interesa." };
  const c = state.cases.find((x) => x.id === caseId);
  if (!c) return { text: "No encontré ese caso." };
  const dispute = disputeForCase(state, c.id);
  const extra = dispute ? " Es un HECHO que hay una disputa abierta; que el reclamo sea válido sigue siendo una INFERENCIA sin confirmar." : "";
  return { text: `${c.property} (${c.id}) aparece porque: ${c.reasonText}, con ${money(caseOutstanding(state, c.id))} pendientes y prioridad ${c.score}/100.${extra}`, caseIds: [c.id] };
}

function invoicesOfEntity(state: AppState, query: string): AgentAnswer {
  const q = norm(query);
  const entity = state.entities.find((e) => q.includes(norm(e.name.replace(" SRL", ""))) || q.includes(norm(e.name)));
  if (!entity) return { text: "No pude identificar la administración. Probá con el nombre completo, por ejemplo \"Administración Norte\"." };
  const inv = invoicesForEntity(state, entity.id);
  return { text: `${entity.name} tiene ${inv.length} factura(s):`, entityIds: [entity.id], invoiceIds: inv.map((i) => i.id) };
}

const rules: { test: (q: string) => boolean; run: (state: AppState, raw: string, ctx: AgentContext) => AgentAnswer }[] = [
  { test: (q) => q.includes("cuanto") && q.includes("deben"), run: (s) => howMuch(s) },
  { test: (q) => q.includes("mayores deudores") || q.includes("mas grandes") || (q.includes("quienes") && q.includes("deudores")), run: (s) => biggestDebtors(s) },
  { test: (q) => q.includes("mayor riesgo") || q.includes("mas riesgo") || q.includes("donde") && q.includes("riesgo"), run: (s) => biggestRisk(s) },
  { test: (q) => q.includes("atencion hoy") || q.includes("necesita mi atencion") || q.includes("que necesita atencion"), run: (s) => needsAttention(s) },
  { test: (q) => q.includes("disputa"), run: (s) => disputedCases(s) },
  { test: (q) => q.includes("promesa"), run: (s) => overduePromisesAnswer(s) },
  { test: (q) => q.includes("pago") && (q.includes("validar") || q.includes("pendiente")), run: (s) => pendingPayments(s) },
  { test: (q) => q.includes("por que") && (q.includes("caso") || q.includes("aparece") || q.includes("primero")), run: (s, raw, ctx) => whyThisCase(s, /primero/.test(raw) ? ctx.lastCaseIds[0] : ctx.lastCaseIds[0]) },
  { test: (q) => q.includes("facturas de") || q.includes("mostrame las facturas"), run: (s, raw) => invoicesOfEntity(s, raw) },
  { test: (q) => q.includes("ese cliente") || q.includes("esa administracion") || q.includes("esa empresa"), run: (s, _raw, ctx) => ctx.lastEntityIds[0] ? invoicesOfEntity(s, s.entities.find((e) => e.id === ctx.lastEntityIds[0])?.name ?? "") : { text: "No tengo un cliente de referencia todavía." } },
  { test: (q) => q.includes("esas facturas") || q.includes("esos documentos"), run: (s, _raw, ctx) => { const ids = ctx.lastInvoiceIds.length ? ctx.lastInvoiceIds : ctx.lastCaseIds.flatMap((id) => s.cases.find((c) => c.id === id)?.invoiceIds ?? []); const inv = s.invoices.filter((i) => ids.includes(i.id)); return inv.length ? { text: inv.map((i) => `- ${i.id}: ${money(i.outstandingCents || i.nominalAmountCents)}`).join("\n"), invoiceIds: inv.map((i) => i.id) } : { text: "No tengo facturas de referencia todavía." }; } },
  { test: (q) => q.includes("el primero") || q.includes("la primera"), run: (s, _raw, ctx) => whyThisCase(s, ctx.lastCaseIds[0]) },
  { test: (q) => q.includes("mostrame el caso") || q.includes("abrime el caso") || q.includes("ver el caso"), run: (s, _raw, ctx) => whyThisCase(s, ctx.lastCaseIds[0]) },
];

export function answerAgent(state: AppState, question: string, context: AgentContext): AgentAnswer {
  const q = norm(question);
  const rule = rules.find((r) => r.test(q));
  if (rule) return rule.run(state, question, context);
  return { text: "Puedo responder sobre cuánto te deben, quiénes son los mayores deudores, dónde hay más riesgo, qué necesita atención hoy, qué casos están en disputa, qué promesas vencieron, qué pagos faltan validar, por qué aparece un caso, o mostrarte las facturas de una administración específica." };
}

export function nextContext(answer: AgentAnswer, prev: AgentContext): AgentContext {
  return { lastCaseIds: answer.caseIds ?? prev.lastCaseIds, lastEntityIds: answer.entityIds ?? prev.lastEntityIds, lastInvoiceIds: answer.invoiceIds ?? prev.lastInvoiceIds };
}
