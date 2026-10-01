import type { AppState, CaseRecord, Confidence, Entity, Invoice } from "./types";

// Recoveria V2.1 — every number any screen shows is computed here, from the
// single AppState, so Resumen/Cartera/Casos/Agente can never contradict
// each other. No component may hardcode a total independently.

export const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(cents / 100).replace("ARS", "$");
export const shortMoney = (cents: number) => { const m = cents / 100_000_000; return m >= 1 ? `$ ${m.toFixed(1).replace(".", ",")} M` : money(cents); };

const isOpenInvoice = (i: Invoice) => i.status !== "pagada";

export function totalOutstanding(state: AppState): number { return state.invoices.filter(isOpenInvoice).reduce((s, i) => s + i.outstandingCents, 0); }
export function totalOverdue(state: AppState): number { return state.invoices.filter((i) => isOpenInvoice(i) && i.daysOverdue > 0).reduce((s, i) => s + i.outstandingCents, 0); }
// "This month" is expressed as a trailing 30-day window ending at asOf,
// rather than a strict calendar-month string match — a payment made a few
// days before the 1st of the reporting month must still count as recently
// recovered, matching how an operator would actually read "este mes".
export function recoveredThisMonth(state: AppState): number {
  const asOfMs = Date.parse(state.asOf);
  return state.invoices.filter((i) => {
    if (i.status !== "pagada" || !i.paidAt) return false;
    const diffDays = (asOfMs - Date.parse(i.paidAt)) / 86_400_000;
    return diffDays >= 0 && diffDays <= 30;
  }).reduce((s, i) => s + i.nominalAmountCents, 0);
}

export function pendingCases(state: AppState): CaseRecord[] { return state.cases.filter((c) => c.status === "pendiente"); }
export function priorityCases(state: AppState): CaseRecord[] { return [...pendingCases(state)].sort((a, b) => b.score - a.score); }
export function casesByStatus(state: AppState, status: CaseRecord["status"]): CaseRecord[] { return state.cases.filter((c) => c.status === status); }
export function riskCounts(state: AppState): { critico: number; alto: number; medio: number } {
  const p = pendingCases(state);
  return { critico: p.filter((c) => c.riskTier === "Crítico").length, alto: p.filter((c) => c.riskTier === "Alto").length, medio: p.filter((c) => c.riskTier === "Medio").length };
}

export function invoicesForCase(state: AppState, caseId: string): Invoice[] { const c = state.cases.find((x) => x.id === caseId); return c ? state.invoices.filter((i) => c.invoiceIds.includes(i.id)) : []; }
export function caseOutstanding(state: AppState, caseId: string): number { return invoicesForCase(state, caseId).reduce((s, i) => s + i.outstandingCents, 0); }
export function entityById(state: AppState, entityId: string): Entity | undefined { return state.entities.find((e) => e.id === entityId); }
export function caseById(state: AppState, caseId: string): CaseRecord | undefined { return state.cases.find((c) => c.id === caseId); }
export function invoiceById(state: AppState, invoiceId: string): Invoice | undefined { return state.invoices.find((i) => i.id === invoiceId); }
export function casesForEntity(state: AppState, entityId: string): CaseRecord[] { return state.cases.filter((c) => c.entityId === entityId); }
export function invoicesForEntity(state: AppState, entityId: string): Invoice[] { return state.invoices.filter((i) => i.entityId === entityId); }
export function evidenceForCase(state: AppState, caseId: string): typeof state.evidence { return state.evidence.filter((e) => e.refId === caseId); }
export function timelineForCase(state: AppState, caseId: string) { return state.timeline.filter((t) => t.caseId === caseId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); }
export function promiseForCase(state: AppState, caseId: string) { const c = caseById(state, caseId); return c?.promiseId ? state.promises.find((p) => p.id === c.promiseId) : undefined; }
export function disputeForCase(state: AppState, caseId: string) { const c = caseById(state, caseId); return c?.disputeId ? state.disputes.find((d) => d.id === c.disputeId) : undefined; }
export function paymentClaimForCase(state: AppState, caseId: string) { const c = caseById(state, caseId); return c?.paymentClaimId ? state.paymentClaims.find((p) => p.id === c.paymentClaimId) : undefined; }
export function draftsForCase(state: AppState, caseId: string) { return state.drafts.filter((d) => d.caseId === caseId); }

export interface EntityTotal { entity: Entity; outstandingCents: number; overdueCents: number; invoiceCount: number; caseCount: number; oldestDays: number; confidence: Confidence; lastActivity: string | null }
export function entityTotals(state: AppState): EntityTotal[] {
  return state.entities.map((entity) => {
    const inv = invoicesForEntity(state, entity.id).filter(isOpenInvoice);
    const casesFor = casesForEntity(state, entity.id);
    const lastEvents = casesFor.flatMap((c) => timelineForCase(state, c.id));
    return {
      entity,
      outstandingCents: inv.reduce((s, i) => s + i.outstandingCents, 0),
      overdueCents: inv.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + i.outstandingCents, 0),
      invoiceCount: inv.length,
      caseCount: casesFor.filter((c) => c.status !== "resuelto").length,
      oldestDays: inv.length ? Math.max(...inv.map((i) => i.daysOverdue)) : 0,
      confidence: confidenceForEntity(state, entity.id),
      lastActivity: lastEvents.length ? lastEvents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]!.occurredAt : null,
    };
  }).filter((t) => t.invoiceCount > 0);
}
export function largestDebtors(state: AppState, limit = 10): EntityTotal[] { return [...entityTotals(state)].sort((a, b) => b.outstandingCents - a.outstandingCents).slice(0, limit); }

// Confidence is derived from the same evidence already attached to the case
// — never a random or decorative label. A case with an unresolved identity
// or dispute can never read as fully documented.
export function confidenceForCase(state: AppState, c: CaseRecord): Confidence {
  if (c.identityUncertain && !c.identityDismissed) return "aconfirmar";
  if (c.disputeId && disputeForCase(state, c.id)?.status === "abierta") return "aconfirmar";
  if (c.paymentClaimId && paymentClaimForCase(state, c.id)?.status === "informado") return "aconfirmar";
  if (invoicesForCase(state, c.id).length > 2) return "reconstruido";
  return "documentado";
}
export function confidenceForEntity(state: AppState, entityId: string): Confidence {
  const casesFor = casesForEntity(state, entityId).filter((c) => c.status !== "resuelto");
  if (!casesFor.length) return "documentado";
  const tiers = casesFor.map((c) => confidenceForCase(state, c));
  if (tiers.includes("aconfirmar")) return "aconfirmar";
  if (tiers.includes("reconstruido")) return "reconstruido";
  return "documentado";
}

export function insight(state: AppState): { headline: string; detail: string; targetCaseIds: string[] } {
  const top = largestDebtors(state, 2);
  const total = totalOverdue(state);
  const topSum = top.reduce((s, t) => s + t.overdueCents, 0);
  const pct = total > 0 ? Math.round((topSum / total) * 100) : 0;
  const names = top.map((t) => t.entity.name.replace(" SRL", "").replace("Administración ", "")).join(" y ");
  const targetCaseIds = top.flatMap((t) => casesForEntity(state, t.entity.id).filter((c) => c.status === "pendiente").map((c) => c.id));
  return { headline: `El ${pct}% del saldo vencido está concentrado en ${top.length} administraciones.`, detail: `Resolver primero ${names} podría destrabar hasta ${money(topSum)}.`, targetCaseIds };
}

export function agingBuckets(state: AppState): { label: string; amountCents: number; pct: number }[] {
  const buckets: [string, number, number][] = [["Al día", -Infinity, 0], ["1–30 días", 1, 30], ["31–60 días", 31, 60], ["61–90 días", 61, 90], ["91–180 días", 91, 180], ["181–365 días", 181, 365], ["+ 1 año", 366, Infinity]];
  const open = state.invoices.filter(isOpenInvoice);
  const total = totalOutstanding(state) || 1;
  return buckets.map(([label, min, max]) => {
    const amt = open.filter((i) => i.daysOverdue >= min && i.daysOverdue <= max).reduce((s, i) => s + i.outstandingCents, 0);
    return { label, amountCents: amt, pct: Math.round((amt / total) * 100) };
  });
}

export function overduePromises(state: AppState) { return state.promises.filter((p) => p.status === "vencida" || p.status === "vence_hoy"); }
export function pendingPaymentClaims(state: AppState) { return state.paymentClaims.filter((p) => p.status === "informado"); }
export function openDisputes(state: AppState) { return state.disputes.filter((d) => d.status === "abierta"); }
export function unreadNotifications(state: AppState) { return state.notifications.filter((n) => !n.read); }

export function whatHappened(state: AppState, c: CaseRecord): string {
  const days = Math.max(0, ...invoicesForCase(state, c.id).map((i) => i.daysOverdue));
  const base = `${invoicesForCase(state, c.id).length} factura${invoicesForCase(state, c.id).length === 1 ? "" : "s"} de ${c.property} acumulan ${days} días de atraso.`;
  if (c.reasonCode === "PROMESA_INCUMPLIDA") return `${base} El cliente prometió pagar y la fecha comprometida ya pasó sin confirmación bancaria.`;
  if (c.reasonCode === "DISPUTA") return `${base} El cliente cuestionó el importe de una de las facturas, lo que pausa el seguimiento de rutina.`;
  if (c.reasonCode === "IDENTIDAD") return `${base} No hay certeza de que la propiedad facturada corresponda a esta administración.`;
  if (c.reasonCode === "PAGO_INFORMADO") return `${base} El cliente informó una transferencia que todavía no aparece conciliada.`;
  if (c.reasonCode === "PROMESA_VENCE_HOY") return `${base} El cliente comprometió el pago para hoy.`;
  if (c.reasonCode === "UMBRAL_LEGAL") return `${base} La antigüedad superó el umbral que Recoveria usa para sugerir revisión humana/legal.`;
  return `${base} No hubo respuesta al último intento de contacto.`;
}

export function knownFacts(state: AppState, c: CaseRecord): string[] {
  const facts = [`Saldo documentado: ${money(caseOutstanding(state, c.id))}, respaldado por ${invoicesForCase(state, c.id).length} factura(s) con evidencia registrada.`];
  const promise = promiseForCase(state, c.id);
  if (promise) facts.push(`Existe un compromiso de pago de ${money(promise.amountCents)} con estado "${promise.status.replace("_", " ")}".`);
  const claim = paymentClaimForCase(state, c.id);
  if (claim) facts.push(`El contacto informó un pago de ${money(claim.amountCents)} por ${claim.method.toLowerCase()} el ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(claim.claimedAt))}.`);
  const dispute = disputeForCase(state, c.id);
  if (dispute) facts.push("Existe una disputa registrada sobre el importe de una factura.");
  return facts;
}

export function unknownFacts(state: AppState, c: CaseRecord): string[] {
  const out: string[] = [];
  const claim = paymentClaimForCase(state, c.id);
  if (claim && claim.status === "informado") out.push("Si la transferencia informada llegó a imputarse contra la factura correspondiente.");
  const dispute = disputeForCase(state, c.id);
  if (dispute && dispute.status === "abierta") out.push("Si el reclamo del cliente sobre el importe es válido.");
  if (c.identityUncertain && !c.identityDismissed) out.push("Si esta propiedad corresponde realmente a esta administración.");
  const promise = promiseForCase(state, c.id);
  if (promise && promise.status === "vigente") out.push("Si el compromiso de pago se cumplirá en la fecha estimada.");
  if (c.reasonCode === "UMBRAL_LEGAL") out.push("Cuál es la decisión legal a tomar — esta revisión no implica una acción legal iniciada.");
  if (c.reasonCode === "SIN_RESPUESTA") out.push("Si el contacto llegó a ver los intentos de contacto anteriores.");
  if (!out.length) out.push("No hay vacíos de información adicionales más allá de la evolución futura del caso.");
  return out;
}

export function statusToneForInvoice(state: AppState, invoice: Invoice): "neutral" | "attention" | "dispute" | "promise" | "success" {
  if (invoice.status === "pagada") return "success";
  if (invoice.status === "disputada") return "dispute";
  const c = state.cases.find((x) => x.invoiceIds.includes(invoice.id));
  if (c?.promiseId) return "promise";
  if (c?.reasonCode === "SIN_RESPUESTA" || c?.reasonCode === "IDENTIDAD") return "attention";
  return "neutral";
}
export function statusLabelForInvoice(state: AppState, invoice: Invoice): string {
  if (invoice.status === "pagada") return "Pagada";
  if (invoice.status === "disputada") return "Disputada";
  if (invoice.status === "pagada_parcial") return "Pago parcial";
  const c = state.cases.find((x) => x.invoiceIds.includes(invoice.id));
  if (c?.reasonCode === "PROMESA_INCUMPLIDA") return "Promesa vencida";
  if (c?.reasonCode === "PROMESA_VENCE_HOY") return "Promesa vence hoy";
  if (c?.reasonCode === "PAGO_INFORMADO") return "Pago informado";
  if (c?.reasonCode === "SIN_RESPUESTA") return "Sin contacto";
  if (c?.reasonCode === "IDENTIDAD") return "Validar identidad";
  return invoice.daysOverdue > 0 ? "Vencida" : "Vigente";
}
