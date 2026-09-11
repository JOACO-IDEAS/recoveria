import { describe, expect, it } from "vitest";
import { PHASE_5B1_SCENARIOS, ENGINE_AS_OF, ENGINE_ORG, caseOf, eventOf, inputOf, invoiceOf } from "@/test/fixtures/phase-5b1-truth-set";
import { appendCollectionEvent, applyHumanDecision, effectiveCollectionEvents, projectCollectionCase, recordHumanDecision } from ".";

describe("Phase 5B.1 collections case engine", () => {
  it("keeps the case building-scoped and invoices granular", () => {
    const input = PHASE_5B1_SCENARIOS.mixedDispute;
    expect(input.case.buildingId).toBe("building-mixed-dispute");
    expect(input.case.invoiceIds).toEqual(["invoice-disputed", "invoice-workable"]);
  });

  it("appends immutable events without changing history", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    const history = input.events;
    const next = appendCollectionEvent(input.case, history, eventOf(input.case.id, "reviewed", "CASE_REVIEWED"));
    expect(history).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next[1])).toBe(true);
  });

  it("uses append-only correction events and retains prior history", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    const recommendation = projectCollectionCase(input).recommendation;
    const decision = recordHumanDecision(recommendation, { organizationId: ENGINE_ORG, id: "decision-claim", actorId: "operator-synthetic", decidedAt: ENGINE_AS_OF, chosenAction: "VERIFY_PAYMENT" });
    const prior = eventOf(input.case.id, "claim-wrong", "PAYMENT_CLAIM_RECORDED", { relatedInvoiceId: input.case.invoiceIds[0], relatedDecisionId: decision.id });
    const correction = eventOf(input.case.id, "claim-corrected", "PAYMENT_CLAIM_RECORDED", { relatedInvoiceId: input.case.invoiceIds[0], relatedDecisionId: decision.id, supersedesEventId: prior.id });
    const history = appendCollectionEvent(input.case, [prior], correction, [decision]);
    expect(history.map(event => event.id)).toEqual([prior.id, correction.id]);
    expect(effectiveCollectionEvents(history).map(event => event.id)).toEqual([correction.id]);
  });

  it("rejects cross-tenant events, decisions and projections", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    expect(() => appendCollectionEvent(input.case, input.events, { ...eventOf(input.case.id, "foreign", "CASE_REVIEWED"), organizationId: "other" })).toThrow(/Cross-tenant/);
    expect(() => projectCollectionCase({ ...input, organizationId: "other" })).toThrow(/Cross-tenant/);
    const recommendation = projectCollectionCase(input).recommendation;
    expect(() => recordHumanDecision(recommendation, { organizationId: "other", id: "d", actorId: "x", decidedAt: ENGINE_AS_OF, chosenAction: "CONTACT" })).toThrow(/Cross-tenant/);
  });

  it("is reproducible and recommendation generation has no side effects", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    const before = structuredClone(input);
    expect(projectCollectionCase(input)).toEqual(projectCollectionCase(input));
    expect(input).toEqual(before);
  });

  it.each([
    ["routine", "CONTACT", "WORKABLE"],
    ["activePromise", "WAIT", "WAITING_FOR_RESPONSE"],
    ["brokenPromise", "FOLLOW_UP", "WORKABLE"],
    ["paymentClaim", "VERIFY_PAYMENT", "REVIEW_REQUIRED"],
    ["entityUncertain", "REVIEW_CASE", "REVIEW_REQUIRED"],
    ["missingContact", "REQUEST_INFORMATION", "WORKABLE"],
    ["legalReview", "PREPARE_LEGAL_REVIEW", "WORKABLE"],
    ["zeroBalance", "CLOSE_CASE", "RESOLVED"],
  ] as const)("projects %s to %s", (key, action, state) => {
    const result = projectCollectionCase(PHASE_5B1_SCENARIOS[key]);
    expect(result.recommendation.action).toBe(action);
    expect(result.workflowState).toBe(state);
    expect(result.recommendation.evidenceRefs.length).toBeGreaterThan(0);
  });

  it("keeps disputed invoices excluded while unrelated overdue invoices stay workable", () => {
    const result = projectCollectionCase(PHASE_5B1_SCENARIOS.mixedDispute);
    expect(result.conditions.map(item => item.condition)).toContain("HAS_DISPUTED_INVOICE");
    expect(result.excludedInvoiceIds).toEqual(["invoice-disputed"]);
    expect(result.collectibleInvoiceIds).toEqual(["invoice-workable"]);
    expect(result.recommendation.action).toBe("CONTACT");
    expect(result.priority).toBe("MEDIUM");
  });

  it("keeps a payment claim distinct from balance-changing confirmation", () => {
    const input = PHASE_5B1_SCENARIOS.paymentClaim;
    const claimed = projectCollectionCase(input);
    expect(claimed.outstandingCents).toBe(100_000_00);
    expect(claimed.conditions.map(item => item.condition)).toContain("HAS_PAYMENT_TO_VERIFY");
    const verified = projectCollectionCase({ ...input, events: [...input.events, eventOf(input.case.id, "verified-1", "PAYMENT_VERIFIED", { data: { claimEventId: "claim-1" } })] });
    expect(verified.outstandingCents).toBe(claimed.outstandingCents);
    expect(verified.conditions.map(item => item.condition)).not.toContain("HAS_PAYMENT_TO_VERIFY");
  });

  it("records human divergence without rewriting the recommendation", () => {
    const recommendation = projectCollectionCase(PHASE_5B1_SCENARIOS.routine).recommendation;
    const decision = recordHumanDecision(recommendation, { organizationId: ENGINE_ORG, id: "decision-diverge", actorId: "operator", decidedAt: ENGINE_AS_OF, chosenAction: "REVIEW_CASE", reason: "Necesita contexto" });
    expect(recommendation.action).toBe("CONTACT");
    expect(decision.recommendedAction).toBe("CONTACT");
    expect(decision.chosenAction).toBe("REVIEW_CASE");
    expect(decision.diverged).toBe(true);
  });

  it("requires a human decision before collection-changing events are appended", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    const recommendation = projectCollectionCase(input).recommendation;
    expect(input.events).toHaveLength(1);
    const decision = recordHumanDecision(recommendation, { organizationId: ENGINE_ORG, id: "decision-contact", actorId: "operator", decidedAt: ENGINE_AS_OF, chosenAction: "CONTACT" });
    const events = applyHumanDecision(input, decision, { eventId: "contact-decision", waitEventId: "wait-started", reason: "Contacto aprobado", evidenceRefs: ["decision:contact"] });
    expect(events.slice(-2).map(event => event.type)).toEqual(["CONTACT_DECISION_RECORDED", "WAIT_STARTED"]);
    expect(events.every(event => event.relatedDecisionId === decision.id || event.type === "CASE_OPENED")).toBe(true);
  });

  it("rejects material events that bypass the human-decision write gate", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    expect(() => appendCollectionEvent(input.case, input.events, eventOf(input.case.id, "promise-bypass", "PROMISE_RECORDED", { data: { promisedFor: "2026-09-20" } }))).toThrow(/explicit human decision/);
    expect(() => appendCollectionEvent(input.case, input.events, eventOf(input.case.id, "system-close", "CASE_CLOSED", { actor: { kind: "SYSTEM", id: "engine" }, relatedDecisionId: "not-human" }))).toThrow(/explicit human decision/);
    expect(() => appendCollectionEvent(input.case, input.events, eventOf(input.case.id, "fabricated", "PROMISE_RECORDED", { relatedDecisionId: "FABRICATED_DECISION_ID_BYPASS" }))).toThrow(/no real human decision/);
  });

  it("simulates open → contact decision → wait → promise → broken promise → follow-up", () => {
    const base = PHASE_5B1_SCENARIOS.routine;
    const initial = projectCollectionCase(base);
    expect(initial.recommendation.action).toBe("CONTACT");
    const contactDecision = recordHumanDecision(initial.recommendation, { organizationId: ENGINE_ORG, id: "decision-1", actorId: "operator", decidedAt: "2026-09-01T13:00:00.000Z", chosenAction: "CONTACT" });
    const afterContactEvents = applyHumanDecision(base, contactDecision, { eventId: "contact-1", waitEventId: "wait-1", reason: "Contacto aprobado", evidenceRefs: ["decision:1"] });
    expect(projectCollectionCase({ ...base, events: afterContactEvents }).recommendation.action).toBe("WAIT");
    const waitingInput = { ...base, events: afterContactEvents };
    const promiseDecision = recordHumanDecision(projectCollectionCase(waitingInput).recommendation, { organizationId: ENGINE_ORG, id: "decision-2", actorId: "operator", decidedAt: "2026-09-02T12:00:00.000Z", chosenAction: "RECORD_PROMISE" });
    const promiseEvents = applyHumanDecision(waitingInput, promiseDecision, { eventId: "promise-1", reason: "Promesa confirmada por operador", evidenceRefs: ["promise:1"], promisedFor: "2026-09-08" });
    expect(projectCollectionCase({ ...base, asOf: "2026-09-05T12:00:00.000Z", events: promiseEvents }).recommendation.action).toBe("WAIT");
    const broken = projectCollectionCase({ ...base, asOf: "2026-09-11T12:00:00.000Z", events: promiseEvents });
    expect(broken.conditions.map(item => item.condition)).toContain("HAS_BROKEN_PROMISE");
    expect(broken.recommendation.action).toBe("FOLLOW_UP");
  });

  it("never turns legal review into legal action", () => {
    const result = projectCollectionCase(PHASE_5B1_SCENARIOS.legalReview);
    expect(result.recommendation.action).toBe("PREPARE_LEGAL_REVIEW");
    expect(JSON.stringify(result)).not.toContain("LEGAL_ACTION");
  });

  it("rejects invoice leakage from another tenant", () => {
    const invoice = invoiceOf("foreign", { organizationId: "other" });
    const input = inputOf("tenant-check", { case: caseOf("tenant-check", [invoice.id]), invoices: [invoice] });
    expect(() => projectCollectionCase(input)).toThrow(/Cross-tenant invoice/);
  });

  it("writes PAYMENT_VERIFIED only through an explicit confirmation decision", () => {
    const input = PHASE_5B1_SCENARIOS.paymentClaim;
    const recommendation = projectCollectionCase(input).recommendation;
    const investigate = recordHumanDecision(recommendation, { organizationId: ENGINE_ORG, id: "decision-investigate", actorId: "operator", decidedAt: ENGINE_AS_OF, chosenAction: "VERIFY_PAYMENT" });
    expect(applyHumanDecision(input, investigate, { eventId: "review-payment", reason: "Investigar", evidenceRefs: [] }).at(-1)?.type).toBe("CASE_REVIEWED");
    const confirmed = recordHumanDecision(recommendation, { organizationId: ENGINE_ORG, id: "decision-confirm", actorId: "operator", decidedAt: ENGINE_AS_OF, chosenAction: "VERIFY_PAYMENT", operation: "CONFIRM_PAYMENT" });
    const events = applyHumanDecision(input, confirmed, { eventId: "verified", reason: "Pago confirmado", evidenceRefs: ["bank:1"], relatedInvoiceId: input.case.invoiceIds[0], claimEventId: "claim-1" });
    expect(events.at(-1)).toMatchObject({ type: "PAYMENT_VERIFIED", relatedDecisionId: confirmed.id, data: { claimEventId: "claim-1" } });
  });

  it("opens and resolves invoice disputes through sanctioned decisions", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    const openDecision = recordHumanDecision(projectCollectionCase(input).recommendation, { organizationId: ENGINE_ORG, id: "decision-open-dispute", actorId: "operator", decidedAt: ENGINE_AS_OF, chosenAction: "REVIEW_DISPUTE", operation: "OPEN_DISPUTE" });
    const opened = applyHumanDecision(input, openDecision, { eventId: "dispute-open", reason: "Disputa documentada", evidenceRefs: ["dispute:1"], relatedInvoiceId: input.case.invoiceIds[0] });
    expect(opened.at(-1)?.type).toBe("DISPUTE_OPENED");
    const disputedInput = { ...input, events: opened };
    const resolveDecision = recordHumanDecision(projectCollectionCase(disputedInput).recommendation, { organizationId: ENGINE_ORG, id: "decision-resolve-dispute", actorId: "operator", decidedAt: ENGINE_AS_OF, chosenAction: "REVIEW_DISPUTE", operation: "RESOLVE_DISPUTE" });
    const resolved = applyHumanDecision(disputedInput, resolveDecision, { eventId: "dispute-resolved", reason: "Disputa resuelta", evidenceRefs: ["dispute:resolution"], relatedInvoiceId: input.case.invoiceIds[0] });
    expect(resolved.at(-1)?.type).toBe("DISPUTE_RESOLVED");
    expect(projectCollectionCase({ ...input, events: resolved }).conditions.map(item => item.condition)).not.toContain("HAS_DISPUTED_INVOICE");
  });

  it("enforces safe correction compatibility, invoice scope, and linear chains", () => {
    const input = inputOf("corrections", { invoices: [invoiceOf("invoice-a"), invoiceOf("invoice-b")] });
    const decision = recordHumanDecision(projectCollectionCase(input).recommendation, { organizationId: ENGINE_ORG, id: "decision-correction", actorId: "operator-synthetic", decidedAt: ENGINE_AS_OF, chosenAction: "RECORD_PROMISE" });
    const original = eventOf(input.case.id, "promise-a", "PROMISE_RECORDED", { relatedInvoiceId: "invoice-a", relatedDecisionId: decision.id, data: { promisedFor: "2026-09-20" } });
    const validB = eventOf(input.case.id, "promise-b", "PROMISE_RECORDED", { relatedInvoiceId: "invoice-a", relatedDecisionId: decision.id, supersedesEventId: original.id, data: { promisedFor: "2026-09-21" } });
    expect(() => appendCollectionEvent(input.case, [original], eventOf(input.case.id, "non-material", "CASE_REVIEWED", { relatedInvoiceId: "invoice-a", supersedesEventId: original.id }))).toThrow(/human decision/);
    expect(() => appendCollectionEvent(input.case, [original], { ...validB, id: "cross-invoice", relatedInvoiceId: "invoice-b" }, [decision])).toThrow(/invoice scope/);
    expect(() => appendCollectionEvent(input.case, [original], eventOf(input.case.id, "wrong-type", "CASE_REVIEWED", { relatedDecisionId: decision.id, relatedInvoiceId: "invoice-a", supersedesEventId: original.id }), [decision])).toThrow(/incompatible/);
    const historyB = appendCollectionEvent(input.case, [original], validB, [decision]);
    expect(() => appendCollectionEvent(input.case, historyB, { ...validB, id: "promise-fork" }, [decision])).toThrow(/Forked/);
    const validC = { ...validB, id: "promise-c", supersedesEventId: validB.id, data: { promisedFor: "2026-09-22" } };
    const historyC = appendCollectionEvent(input.case, historyB, validC, [decision]);
    expect(effectiveCollectionEvents(historyC).map(event => event.id)).toEqual(["promise-c"]);
  });

  it("prioritizes an invoice dispute over follow-up on its broken promise", () => {
    const invoice = invoiceOf("invoice-disputed-promise", { disputed: true });
    const input = inputOf("disputed-promise", { invoices: [invoice], events: [eventOf("disputed-promise", "promise", "PROMISE_RECORDED", { relatedInvoiceId: invoice.id, data: { promisedFor: "2026-09-01" } })] });
    const result = projectCollectionCase(input);
    expect(result.recommendation.action).toBe("REVIEW_DISPUTE");
    expect(result.recommendation.blockers.map(item => item.code)).toContain("DISPUTE_BLOCKER");
    expect(result.recommendation.evidenceRefs).toEqual(expect.arrayContaining([...invoice.evidenceRefs]));
  });

  it("keeps legal review case-level while explicitly blocking on an active dispute", () => {
    const invoice = invoiceOf("invoice-legal-dispute", { disputed: true });
    const result = projectCollectionCase(inputOf("legal-dispute", { invoices: [invoice], legalReviewThreshold: true }));
    expect(result.recommendation.action).toBe("PREPARE_LEGAL_REVIEW");
    expect(result.recommendation.blockers.map(item => item.code)).toContain("DISPUTE_BLOCKER");
    expect(result.recommendation.evidenceRefs).toEqual(expect.arrayContaining([...invoice.evidenceRefs]));
  });

  it.each([
    ["open dispute", { invoices: [invoiceOf("zero-disputed", { outstandingCents: 0, daysOverdue: 0, disputed: true })] }],
    ["payment to verify", { invoices: [invoiceOf("zero-claim", { outstandingCents: 0, daysOverdue: 0 })], events: [eventOf("zero-guard", "zero-claim-event", "PAYMENT_CLAIM_RECORDED", { relatedInvoiceId: "zero-claim" })] }],
  ] as const)("does not silently close a zero-balance case with %s", (_label, options) => {
    const result = projectCollectionCase(inputOf("zero-guard", options));
    expect(result.outstandingCents).toBe(0);
    expect(result.workflowState).toBe("REVIEW_REQUIRED");
    expect(result.recommendation.action).not.toBe("CLOSE_CASE");
  });

  it("rejects a decision whose recommendation became stale after a material change", () => {
    const input = PHASE_5B1_SCENARIOS.routine;
    const decision = recordHumanDecision(projectCollectionCase(input).recommendation, { organizationId: ENGINE_ORG, id: "decision-stale", actorId: "operator", decidedAt: ENGINE_AS_OF, chosenAction: "RECORD_PROMISE" });
    const changed = { ...input, events: [...input.events, eventOf(input.case.id, "new-claim", "PAYMENT_CLAIM_RECORDED", { relatedInvoiceId: input.case.invoiceIds[0] })] };
    expect(() => applyHumanDecision(changed, decision, { eventId: "stale-promise", reason: "Vieja", evidenceRefs: [], promisedFor: "2026-09-20" })).toThrow(/Stale decision/);
  });
});
