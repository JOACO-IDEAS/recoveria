import { deepFreeze } from "@/lib/domain/evidence";
import { effectiveCollectionEvents } from "./event-ledger";
import type { CaseCondition, CaseProjection, CollectionEvent, ConditionExplanation, NextAction, ProjectionInput, RecommendationReason } from "./types";

export const COLLECTIONS_POLICY_VERSION = "collections-next-action/1";

const latest = (events: readonly CollectionEvent[], types: readonly CollectionEvent["type"][]) =>
  [...events].filter(event => types.includes(event.type)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))[0];

const evidence = (refs: readonly string[]) => [...new Set(refs)].sort();

export function projectCollectionCase(input: ProjectionInput): CaseProjection {
  if (input.case.organizationId !== input.organizationId) throw new Error("Cross-tenant case projection rejected");
  const invoices = input.invoices.filter(invoice => input.case.invoiceIds.includes(invoice.id));
  if (invoices.length !== input.case.invoiceIds.length) throw new Error("Case projection requires every referenced invoice");
  if (invoices.some(invoice => invoice.organizationId !== input.organizationId)) throw new Error("Cross-tenant invoice rejected");
  if (invoices.some(invoice => !Number.isSafeInteger(invoice.outstandingCents) || invoice.outstandingCents < 0)) throw new Error("Invalid invoice balance");
  if (input.events.some(event => event.organizationId !== input.organizationId || event.caseId !== input.case.id)) throw new Error("Cross-tenant event rejected");

  const events = effectiveCollectionEvents(input.events);
  const conditions: ConditionExplanation[] = [];
  const add = (condition: CaseCondition, reason: string, evidenceRefs: readonly string[], relatedInvoiceIds: readonly string[] = []) =>
    conditions.push({ condition, reason, evidenceRefs: evidence(evidenceRefs), relatedInvoiceIds: [...relatedInvoiceIds] });

  const disputeByInvoice = new Map(invoices.map(invoice => [invoice.id, invoice.disputed]));
  for (const event of events) {
    if (!event.relatedInvoiceId) continue;
    if (event.type === "DISPUTE_OPENED") disputeByInvoice.set(event.relatedInvoiceId, true);
    if (event.type === "DISPUTE_RESOLVED") disputeByInvoice.set(event.relatedInvoiceId, false);
  }
  const disputed = invoices.filter(invoice => disputeByInvoice.get(invoice.id));
  const collectible = invoices.filter(invoice => invoice.outstandingCents > 0 && invoice.daysOverdue > 0 && !disputeByInvoice.get(invoice.id));
  const outstandingCents = invoices.reduce((sum, invoice) => sum + invoice.outstandingCents, 0);

  if (input.entityConfidence !== "CONFIRMED") add("ENTITY_UNCERTAIN", "La identidad del caso necesita confirmación", input.evidenceRefs);
  if (!input.contactAvailable) add("MISSING_CONTACT", "No existe un contacto confirmado", input.evidenceRefs);
  if (disputed.length) add("HAS_DISPUTED_INVOICE", "Hay facturas en disputa", disputed.flatMap(invoice => invoice.evidenceRefs), disputed.map(invoice => invoice.id));

  const claimEvents = events.filter(event => event.type === "PAYMENT_CLAIM_RECORDED");
  const verifiedClaimIds = new Set(events.filter(event => event.type === "PAYMENT_VERIFIED").map(event => String(event.data?.claimEventId ?? "")));
  const pendingClaims = claimEvents.filter(event => !verifiedClaimIds.has(event.id));
  if (pendingClaims.length) add("HAS_PAYMENT_TO_VERIFY", "Existe un pago informado que todavía no fue confirmado", pendingClaims.flatMap(event => event.evidenceRefs), pendingClaims.flatMap(event => event.relatedInvoiceId ? [event.relatedInvoiceId] : []));

  const promise = latest(events, ["PROMISE_RECORDED"]);
  const promisedFor = typeof promise?.data?.promisedFor === "string" ? promise.data.promisedFor : undefined;
  if (promise && promisedFor) {
    if (promisedFor < input.asOf.slice(0, 10)) add("HAS_BROKEN_PROMISE", `La promesa venció el ${promisedFor}`, promise.evidenceRefs);
    else add("HAS_ACTIVE_PROMISE", `Existe una promesa vigente hasta el ${promisedFor}`, promise.evidenceRefs);
  }
  if (input.legalReviewThreshold) add("LEGAL_REVIEW_THRESHOLD", "El caso alcanzó el umbral de revisión legal interna", input.evidenceRefs);

  const closed = events.some(event => event.type === "CASE_CLOSED");
  const waiting = latest(events, ["WAIT_STARTED", "WAIT_ENDED"])?.type === "WAIT_STARTED";
  const has = (condition: CaseCondition) => conditions.some(item => item.condition === condition);
  let workflowState: CaseProjection["workflowState"] = "WORKABLE";
  if (outstandingCents === 0 || closed) workflowState = "RESOLVED";
  else if (has("ENTITY_UNCERTAIN") || has("HAS_PAYMENT_TO_VERIFY") || (has("HAS_DISPUTED_INVOICE") && collectible.length === 0)) workflowState = "REVIEW_REQUIRED";
  else if (has("HAS_ACTIVE_PROMISE") || waiting) workflowState = "WAITING_FOR_RESPONSE";

  let action: NextAction;
  let reason: RecommendationReason;
  const blockers: RecommendationReason[] = [];
  if (workflowState === "RESOLVED") [action, reason] = ["CLOSE_CASE", { code: "ZERO_BALANCE", text: "El caso no tiene saldo pendiente", evidenceRefs: input.evidenceRefs }];
  else if (has("ENTITY_UNCERTAIN")) [action, reason] = ["REVIEW_CASE", { code: "ENTITY_UNCERTAIN", text: "Confirmar la identidad antes de continuar", evidenceRefs: input.evidenceRefs }];
  else if (has("HAS_PAYMENT_TO_VERIFY")) [action, reason] = ["VERIFY_PAYMENT", { code: "PAYMENT_TO_VERIFY", text: "Verificar el pago informado sin modificar el saldo", evidenceRefs: pendingClaims.flatMap(event => event.evidenceRefs) }];
  else if (has("LEGAL_REVIEW_THRESHOLD")) [action, reason] = ["PREPARE_LEGAL_REVIEW", { code: "LEGAL_REVIEW_THRESHOLD", text: "Preparar una revisión legal interna", evidenceRefs: input.evidenceRefs }];
  else if (has("HAS_BROKEN_PROMISE")) [action, reason] = ["FOLLOW_UP", { code: "BROKEN_PROMISE", text: "Retomar seguimiento por promesa vencida", evidenceRefs: promise?.evidenceRefs ?? [] }];
  else if (has("HAS_ACTIVE_PROMISE") || waiting) [action, reason] = ["WAIT", { code: "WAITING", text: "Esperar antes de un nuevo contacto", evidenceRefs: promise?.evidenceRefs ?? events.filter(event => event.type === "WAIT_STARTED").flatMap(event => event.evidenceRefs) }];
  else if (has("MISSING_CONTACT")) [action, reason] = ["REQUEST_INFORMATION", { code: "MISSING_CONTACT", text: "Obtener un contacto confirmado", evidenceRefs: input.evidenceRefs }];
  else if (collectible.length) [action, reason] = ["CONTACT", { code: "OVERDUE_WORKABLE", text: "Contactar por facturas vencidas cobrables", evidenceRefs: collectible.flatMap(invoice => invoice.evidenceRefs) }];
  else [action, reason] = ["REVIEW_DISPUTE", { code: "DISPUTED_ONLY", text: "Revisar las facturas en disputa", evidenceRefs: disputed.flatMap(invoice => invoice.evidenceRefs) }];

  if (has("ENTITY_UNCERTAIN")) blockers.push({ code: "ENTITY_BLOCKER", text: "La identidad debe confirmarse", evidenceRefs: input.evidenceRefs });
  if (has("HAS_PAYMENT_TO_VERIFY")) blockers.push({ code: "PAYMENT_BLOCKER", text: "El pago informado no altera el saldo hasta verificarse", evidenceRefs: pendingClaims.flatMap(event => event.evidenceRefs) });
  const priority: CaseProjection["priority"] = workflowState === "RESOLVED" || action === "WAIT" ? "LOW" : has("HAS_BROKEN_PROMISE") || has("HAS_PAYMENT_TO_VERIFY") || has("LEGAL_REVIEW_THRESHOLD") ? "CRITICAL" : action === "CONTACT" ? "MEDIUM" : "HIGH";
  const recommendationEvidence = evidence([...(reason.evidenceRefs), ...blockers.flatMap(item => item.evidenceRefs)]);
  const recommendation = deepFreeze({ id: `rec:${input.case.id}:${input.asOf}:${COLLECTIONS_POLICY_VERSION}`, organizationId: input.organizationId, caseId: input.case.id, action, reasons: [reason], blockers, evidenceRefs: recommendationEvidence, generatedAt: input.asOf, policyVersion: COLLECTIONS_POLICY_VERSION });
  return deepFreeze({ organizationId: input.organizationId, caseId: input.case.id, asOf: input.asOf, workflowState, priority, conditions, outstandingCents, collectibleInvoiceIds: collectible.map(invoice => invoice.id), excludedInvoiceIds: disputed.map(invoice => invoice.id), recommendation, evidenceRefs: evidence([...input.evidenceRefs, ...invoices.flatMap(invoice => invoice.evidenceRefs), ...events.flatMap(event => event.evidenceRefs)]) });
}
