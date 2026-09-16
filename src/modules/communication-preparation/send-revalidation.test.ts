import { describe, expect, it } from "vitest";
import { deriveCollectionInteractionContext, projectCollectionCaseWithInteractionContext } from "@/modules/collection-interactions";
import { resolveCollectionContacts } from "@/modules/contact-relationships";
import { channelOf, contactContextOf, contactOf, relationshipOf } from "@/test/fixtures/phase-5b2a-contact-truth-set";
import { claimOf, disputeOf, interactionCaseOf, interactionInput, interactionOf, promiseOf, verifiedEvent } from "@/test/fixtures/phase-5b2b-interaction-truth-set";
import { invoiceOf } from "@/test/fixtures/phase-5b1-truth-set";
import { communicationCase, communicationInput, communicationInvoice, inputWithInteraction } from "@/test/fixtures/phase-5b3-communication-truth-set";
import { createCommunicationDraftRequest, createCommunicationSendPreparation, createValidatedCommunicationDraft, DeterministicTemplateDraftProvider, evaluateCommunicationPreparation, recordDraftApproval, revalidateCommunicationForSend } from ".";
import * as communicationPreparation from ".";
import type { CommunicationPreparationInput, DraftApproval } from ".";

const requestMeta = { id: "request-send", requestedAt: "2026-09-11T13:00:00.000Z", requestedBy: "operator" };
const preparationMeta = { id: "send-preparation-1", requestedAt: "2026-09-11T14:00:00.000Z", requestedBy: "operator" };

const approvedScenario = (current = communicationInput()) => {
  const evaluation = evaluateCommunicationPreparation(current);
  const draftRequest = createCommunicationDraftRequest(evaluation, requestMeta);
  const draft = createValidatedCommunicationDraft(new DeterministicTemplateDraftProvider(), draftRequest);
  const approval = recordDraftApproval(draft, { id: "approval-send", status: "APPROVED", actor: { kind: "HUMAN", id: "reviewer" }, decidedAt: "2026-09-11T13:30:00.000Z" });
  const preparation = createCommunicationSendPreparation({ draft, draftRequest, approval, ...preparationMeta });
  return { current, draftRequest, draft, approval, preparation };
};

const revalidate = (scenario: ReturnType<typeof approvedScenario>, current = scenario.current) => revalidateCommunicationForSend({ ...scenario, current, asOf: current.interactionContext.asOf });

const withContactResolution = (input: CommunicationPreparationInput, resolution: CommunicationPreparationInput["interactionContext"]["relevantContacts"]): CommunicationPreparationInput => ({
  ...input,
  interactionContext: deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: resolution })),
});

describe("Phase 5B.4A send state machine and revalidation", () => {
  it("transitions an approved unchanged draft through revalidation to READY_TO_SEND", () => {
    const scenario = approvedScenario();
    expect(scenario.preparation.state).toBe("REVALIDATION_REQUIRED");
    const result = revalidate(scenario);
    expect(result.preparation).toMatchObject({ state: "READY_TO_SEND", blockers: [] });
    expect(result.authorization).toMatchObject({ state: "READY_TO_SEND", authorizedAt: scenario.current.interactionContext.asOf, asOf: scenario.current.interactionContext.asOf });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.authorization)).toBe(true);
  });

  it("accepts only explicit HUMAN approval provenance without inferring from actor ID", () => {
    const scenario = approvedScenario();
    expect(scenario.approval.actor).toEqual({ kind: "HUMAN", id: "reviewer" });
    const humanNamedSystem = recordDraftApproval(scenario.draft, { id: "approval-human-system-name", status: "APPROVED", actor: { kind: "HUMAN", id: "system" }, decidedAt: "2026-09-11T13:45:00.000Z" });
    expect(createCommunicationSendPreparation({ ...preparationMeta, id: "human-system-name", draft: scenario.draft, draftRequest: scenario.draftRequest, approval: humanNamedSystem }).state).toBe("REVALIDATION_REQUIRED");
    expect(Object.isFrozen(scenario.approval.actor)).toBe(true);
  });

  it("rejects SYSTEM, empty, missing, malformed, and unknown approval actors", () => {
    const scenario = approvedScenario();
    for (const id of ["system", "scheduler"]) {
      const systemApproval = recordDraftApproval(scenario.draft, { id: `approval-${id}`, status: "APPROVED", actor: { kind: "SYSTEM", id }, decidedAt: "2026-09-11T13:45:00.000Z" });
      expect(() => createCommunicationSendPreparation({ ...preparationMeta, draft: scenario.draft, draftRequest: scenario.draftRequest, approval: systemApproval })).toThrow(/Explicit HUMAN approval/);
    }
    expect(() => recordDraftApproval(scenario.draft, { id: "empty-human", status: "APPROVED", actor: { kind: "HUMAN", id: "" }, decidedAt: "2026-09-11T13:45:00.000Z" })).toThrow(/explicit valid actor/);
    expect(() => recordDraftApproval(scenario.draft, { id: "missing-actor", status: "APPROVED", decidedAt: "2026-09-11T13:45:00.000Z" } as never)).toThrow(/explicit valid actor/);
    expect(() => recordDraftApproval(scenario.draft, { id: "malformed-actor", status: "APPROVED", actor: "reviewer", decidedAt: "2026-09-11T13:45:00.000Z" } as never)).toThrow(/explicit valid actor/);
    expect(() => recordDraftApproval(scenario.draft, { id: "unknown-actor", status: "APPROVED", actor: { kind: "IMPORT", id: "importer" }, decidedAt: "2026-09-11T13:45:00.000Z" } as never)).toThrow(/explicit valid actor/);
  });

  it("rejects approval chronology that predates draft creation", () => {
    const scenario = approvedScenario();
    expect(() => recordDraftApproval(scenario.draft, { id: "approval-before-draft", status: "APPROVED", actor: { kind: "HUMAN", id: "reviewer" }, decidedAt: "2026-09-11T12:59:59.999Z" })).toThrow(/cannot predate/);
    const impossible = { ...scenario.approval, decidedAt: "2026-09-11T12:59:59.999Z" };
    expect(() => createCommunicationSendPreparation({ ...preparationMeta, draft: scenario.draft, draftRequest: scenario.draftRequest, approval: impossible })).toThrow(/cannot predate/);
  });

  it("blocks a decreased balance without editing the approved draft", () => {
    const scenario = approvedScenario();
    const before = structuredClone(scenario.draft);
    const result = revalidate(scenario, { ...scenario.current, invoices: [communicationInvoice("invoice-a", { outstandingCents: 700_000_00, overdueCents: 700_000_00 })] });
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["STALE_DRAFT", "BALANCE_CHANGED"]));
    expect(result.authorization).toBeUndefined();
    expect(scenario.draft).toEqual(before);
  });

  it("blocks a zero balance", () => {
    const result = revalidate(approvedScenario(), inputWithInteraction({ zero: true }));
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["STALE_DRAFT", "BALANCE_CHANGED", "ZERO_BALANCE"]));
  });

  it("blocks a new pending payment claim on a routine target", () => {
    const result = revalidate(approvedScenario(), inputWithInteraction({ claim: true }));
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["PAYMENT_CLAIM_APPEARED", "INVOICE_SCOPE_CHANGED", "STALE_DRAFT"]));
  });

  it("blocks a verified payment claim after routine approval", () => {
    const scenario = approvedScenario();
    const claim = claimOf("claim-verified-send", { claimedAmountCents: 800_000_00 });
    const event = verifiedEvent(claim.id);
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: scenario.current.interactionContext.relevantContacts, paymentClaims: [claim], collectionEvents: [event] }));
    const current = { ...scenario.current, interactionContext: context };
    expect(revalidate(scenario, current).preparation.blockers).toContain("PAYMENT_STATE_CHANGED");
  });

  it("blocks a new dispute on a target invoice", () => {
    const result = revalidate(approvedScenario(), inputWithInteraction({ dispute: true }));
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["DISPUTE_OPENED", "INVOICE_SCOPE_CHANGED", "STALE_DRAFT"]));
  });

  it("does not revive an old approval after a claim or dispute resolves", () => {
    const scenario = approvedScenario();
    const context = deriveCollectionInteractionContext(interactionInput({
      case: communicationCase,
      contactResolution: scenario.current.interactionContext.relevantContacts,
      paymentClaims: [claimOf("claim-rejected-send", { resolution: "REJECTED" })],
      disputes: [disputeOf("dispute-resolved-send", { status: "RESOLVED" })],
    }));
    const current = { ...scenario.current, interactionContext: context };
    const result = revalidate(scenario, current);
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["STALE_DRAFT", "PAYMENT_STATE_CHANGED", "DISPUTE_OPENED"]));
    expect(revalidate(approvedScenario(current), current).preparation.state).toBe("READY_TO_SEND");
  });

  it("blocks an active promise on a routine target", () => {
    const result = revalidate(approvedScenario(), inputWithInteraction({ promise: "ACTIVE" }));
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["PROMISE_STATE_CHANGED", "INVOICE_SCOPE_CHANGED", "STALE_DRAFT"]));
  });

  it("blocks a broken-promise draft after the promise becomes fulfilled", () => {
    const approved = approvedScenario(inputWithInteraction({ promise: "BROKEN" }));
    const promise = promiseOf("promise-communication", { promisedDate: "2026-09-09" });
    const claim = claimOf("claim-fulfilled-send", { claimedAmountCents: promise.amountCents });
    const event = verifiedEvent(claim.id);
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: approved.current.interactionContext.relevantContacts, promises: [promise], paymentClaims: [claim], collectionEvents: [event] }));
    const projection = projectCollectionCaseWithInteractionContext({ projectionInput: { organizationId: communicationCase.organizationId, case: communicationCase, invoices: [invoiceOf("invoice-a")], contactAvailable: true, entityConfidence: "CONFIRMED", legalReviewThreshold: false, evidenceRefs: ["recommendation:fulfilled"] }, interactionContext: context, collectionEvents: [event] });
    const current = communicationInput({ interactionContext: context, projection });
    expect(revalidate(approved, current).preparation.blockers).toEqual(expect.arrayContaining(["PROMISE_STATE_CHANGED", "STALE_DRAFT"]));
  });

  it("blocks a broken-promise draft after the relied-on promise is superseded", () => {
    const approved = approvedScenario(inputWithInteraction({ promise: "BROKEN" }));
    const prior = promiseOf("promise-communication", { promisedDate: "2026-09-09" });
    const replacement = promiseOf("promise-replacement", { supersedesPromiseId: prior.id, promisedDate: "2026-09-20" });
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: approved.current.interactionContext.relevantContacts, promises: [prior, replacement] }));
    const current = { ...approved.current, interactionContext: context };
    expect(revalidate(approved, current).preparation.blockers).toEqual(expect.arrayContaining(["PROMISE_STATE_CHANGED", "STALE_DRAFT"]));
  });

  it("blocks when the selected contact relationship is superseded", () => {
    const scenario = approvedScenario();
    const juan = contactOf("juan", { displayName: "Juan García" });
    const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "email-juan", { type: "EMAIL", rawValue: "juan@example.invalid", normalizedValue: "juan@example.invalid" })], relationships: [relationshipOf(juan.id, "relationship-juan", { status: "SUPERSEDED" })] }));
    expect(revalidate(scenario, withContactResolution(scenario.current, resolution)).preparation.blockers).toContain("CONTACT_NO_LONGER_ELIGIBLE");
  });

  it("blocks when the selected channel becomes invalid", () => {
    const scenario = approvedScenario();
    const juan = contactOf("juan", { displayName: "Juan García" });
    const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "email-juan", { type: "EMAIL", status: "INVALID", rawValue: "juan@example.invalid", normalizedValue: "juan@example.invalid" })], relationships: [relationshipOf(juan.id, "relationship-juan")] }));
    expect(revalidate(scenario, withContactResolution(scenario.current, resolution)).preparation.blockers).toContain("CHANNEL_NO_LONGER_ELIGIBLE");
  });

  it("keeps the selected contact when another contact becomes ready but requires a fresh approval", () => {
    const scenario = approvedScenario();
    const juan = contactOf("juan", { displayName: "Juan García" });
    const maria = contactOf("maria", { displayName: "María López" });
    const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan, maria], channels: [channelOf(juan.id, "email-juan", { type: "EMAIL", rawValue: "juan@example.invalid", normalizedValue: "juan@example.invalid" }), channelOf(maria.id, "email-maria", { type: "EMAIL" })], relationships: [relationshipOf(juan.id, "relationship-juan"), relationshipOf(maria.id, "relationship-maria")] }));
    const result = revalidate(scenario, withContactResolution(scenario.current, resolution));
    expect(result.preparation.blockers).toContain("STALE_DRAFT");
    expect(result.preparation.blockers).not.toEqual(expect.arrayContaining(["CONTACT_NO_LONGER_ELIGIBLE", "CHANNEL_NO_LONGER_ELIGIBLE"]));
  });

  it("blocks changed invoice scope", () => {
    const scenario = approvedScenario();
    const current = { ...scenario.current, projection: { ...scenario.current.projection, collectibleInvoiceIds: [], excludedInvoiceIds: ["invoice-a"] } };
    expect(revalidate(scenario, current).preparation.blockers).toContain("INVOICE_SCOPE_CHANGED");
  });

  it("blocks revocation of payment-verification policy", () => {
    const scenario = approvedScenario(inputWithInteraction({ claim: true }));
    const result = revalidate(scenario, { ...scenario.current, allowPaymentVerificationRequest: false });
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["POLICY_CHANGED", "STALE_DRAFT"]));
  });

  it("blocks recommendation changes", () => {
    const scenario = approvedScenario();
    const current = { ...scenario.current, projection: { ...scenario.current.projection, recommendation: { ...scenario.current.projection.recommendation, action: "FOLLOW_UP" as const } } };
    expect(revalidate(scenario, current).preparation.blockers).toEqual(expect.arrayContaining(["RECOMMENDATION_CHANGED", "STALE_DRAFT"]));
  });

  it("blocks legal review and entity ambiguity", () => {
    const scenario = approvedScenario();
    const legal = inputWithInteraction({ legal: true });
    expect(revalidate(scenario, legal).preparation.blockers).toContain("LEGAL_REVIEW_REQUIRED");
    const condition = { condition: "ENTITY_UNCERTAIN" as const, reason: "Ambiguous", evidenceRefs: ["entity:ambiguous"], relatedInvoiceIds: [] };
    const ambiguous = { ...scenario.current, projection: { ...scenario.current.projection, conditions: [...scenario.current.projection.conditions, condition] } };
    expect(revalidate(scenario, ambiguous).preparation.blockers).toContain("ENTITY_AMBIGUITY");
  });

  it("hard-rejects cross-tenant approvals, wrong cases, and rejected approvals", () => {
    const scenario = approvedScenario();
    expect(() => createCommunicationSendPreparation({ ...scenario, ...preparationMeta, approval: { ...scenario.approval, organizationId: "other" } })).toThrow(/Cross-tenant/);
    expect(() => createCommunicationSendPreparation({ ...scenario, ...preparationMeta, approval: { ...scenario.approval, status: "REJECTED" } })).toThrow(/Explicit HUMAN approval/);
    expect(() => revalidateCommunicationForSend({ ...scenario, current: { ...scenario.current, caseId: "other-case" }, asOf: scenario.current.interactionContext.asOf })).toThrow(/Cross-case/);
  });

  it("hard-rejects wrong approval linkage and inconsistent explicit asOf", () => {
    const scenario = approvedScenario();
    const wrongApproval: DraftApproval = { ...scenario.approval, draftId: "other-draft" };
    expect(() => createCommunicationSendPreparation({ ...scenario, ...preparationMeta, approval: wrongApproval })).toThrow(/linkage/);
    expect(() => revalidateCommunicationForSend({ ...scenario, current: scenario.current, asOf: "2026-09-12T00:00:00.000Z" })).toThrow(/explicit consistent asOf/);
  });

  it("revalidates the approved draft contract before creating send preparation", () => {
    const scenario = approvedScenario();
    const unsafeDraft = { ...scenario.draft, body: "Hola Juan García, último aviso: debe pagar." };
    expect(() => createCommunicationSendPreparation({ ...preparationMeta, draft: unsafeDraft, draftRequest: scenario.draftRequest, approval: scenario.approval })).toThrow(/Unsafe approved/);
  });

  it("uses deterministic idempotency for duplicate preparation and authorization attempts", () => {
    const scenario = approvedScenario();
    const duplicate = createCommunicationSendPreparation({ draft: scenario.draft, draftRequest: scenario.draftRequest, approval: scenario.approval, ...preparationMeta });
    expect(duplicate).toEqual(scenario.preparation);
    expect(revalidate(scenario)).toEqual(revalidate({ ...scenario, preparation: duplicate }));
  });

  it("maps independent approvals of the same draft to one execution identity", () => {
    const first = approvedScenario();
    const secondApproval = recordDraftApproval(first.draft, { id: "approval-send-2", status: "APPROVED", actor: { kind: "HUMAN", id: "second-reviewer" }, decidedAt: "2026-09-11T13:45:00.000Z" });
    const secondPreparation = createCommunicationSendPreparation({ ...preparationMeta, id: "send-preparation-2", draft: first.draft, draftRequest: first.draftRequest, approval: secondApproval });
    const firstResult = revalidate(first);
    const secondResult = revalidateCommunicationForSend({ preparation: secondPreparation, draft: first.draft, draftRequest: first.draftRequest, approval: secondApproval, current: first.current, asOf: first.current.interactionContext.asOf });
    expect(secondPreparation.idempotencyKey).toBe(first.preparation.idempotencyKey);
    expect(secondResult.authorization?.id).toBe(firstResult.authorization?.id);
    expect(secondResult.authorization?.idempotencyKey).toBe(firstResult.authorization?.idempotencyKey);
    expect(secondResult.authorization?.approvalId).not.toBe(firstResult.authorization?.approvalId);
  });

  it("allows a new draft a distinct execution identity", () => {
    const first = approvedScenario();
    const evaluation = evaluateCommunicationPreparation(first.current);
    const secondRequest = createCommunicationDraftRequest(evaluation, { ...requestMeta, id: "request-send-new-draft" });
    const secondDraft = createValidatedCommunicationDraft(new DeterministicTemplateDraftProvider(), secondRequest);
    const secondApproval = recordDraftApproval(secondDraft, { id: "approval-new-draft", status: "APPROVED", actor: { kind: "HUMAN", id: "reviewer" }, decidedAt: "2026-09-11T13:45:00.000Z" });
    const secondPreparation = createCommunicationSendPreparation({ ...preparationMeta, id: "send-preparation-new-draft", draft: secondDraft, draftRequest: secondRequest, approval: secondApproval });
    const secondResult = revalidateCommunicationForSend({ preparation: secondPreparation, draft: secondDraft, draftRequest: secondRequest, approval: secondApproval, current: first.current, asOf: first.current.interactionContext.asOf });
    expect(secondDraft.id).not.toBe(first.draft.id);
    expect(secondResult.authorization?.idempotencyKey).not.toBe(revalidate(first).authorization?.idempotencyKey);
  });

  it("does not let a new approval revive the same stale draft", () => {
    const scenario = approvedScenario();
    const secondApproval = recordDraftApproval(scenario.draft, { id: "approval-stale-2", status: "APPROVED", actor: { kind: "HUMAN", id: "reviewer-2" }, decidedAt: "2026-09-11T13:45:00.000Z" });
    const preparation = createCommunicationSendPreparation({ ...preparationMeta, id: "send-preparation-stale-2", draft: scenario.draft, draftRequest: scenario.draftRequest, approval: secondApproval });
    const current = { ...scenario.current, invoices: [communicationInvoice("invoice-a", { outstandingCents: 700_000_00, overdueCents: 700_000_00 })] };
    const result = revalidateCommunicationForSend({ preparation, draft: scenario.draft, draftRequest: scenario.draftRequest, approval: secondApproval, current, asOf: current.interactionContext.asOf });
    expect(result.preparation.blockers).toEqual(expect.arrayContaining(["STALE_DRAFT", "BALANCE_CHANGED"]));
    expect(result.authorization).toBeUndefined();
  });

  it("exposes no execution function or alternate authorization factory for fabricated authorization objects", () => {
    const fabricated = { state: "READY_TO_SEND", id: "fabricated" };
    const unsafeExports = Object.keys(communicationPreparation).filter(name => /^(?:send|execute|createCommunicationSendAuthorization)$/i.test(name));
    expect(fabricated.state).toBe("READY_TO_SEND");
    expect(unsafeExports).toEqual([]);
  });

  it("does not stale for unrelated chronology or a non-safety display label", () => {
    const base = communicationInput();
    const mixedCase = interactionCaseOf(["invoice-a", "invoice-b"]);
    const approvedContext = deriveCollectionInteractionContext(interactionInput({ case: mixedCase, contactResolution: base.interactionContext.relevantContacts }));
    const approved = approvedScenario(communicationInput({ interactionContext: approvedContext, invoices: [communicationInvoice("invoice-a"), communicationInvoice("invoice-b")], projection: { ...base.projection, collectibleInvoiceIds: ["invoice-a"], excludedInvoiceIds: ["invoice-b"] } }));
    const currentContext = deriveCollectionInteractionContext(interactionInput({ case: mixedCase, contactResolution: base.interactionContext.relevantContacts, interactions: [interactionOf("unrelated", "CONTACT_ATTEMPTED", { channelId: "email-juan", relatedInvoiceIds: ["invoice-b"] })] }));
    const current = { ...approved.current, administrationName: "Etiqueta visual no operativa", interactionContext: currentContext };
    expect(revalidate(approved, current).preparation).toMatchObject({ state: "READY_TO_SEND", blockers: [] });
  });

  it("safely over-blocks reordered invoice arrays until fingerprint canonicalization", () => {
    const base = communicationInput();
    const mixedCase = interactionCaseOf(["invoice-a", "invoice-b"]);
    const context = deriveCollectionInteractionContext(interactionInput({ case: mixedCase, contactResolution: base.interactionContext.relevantContacts }));
    const approved = approvedScenario(communicationInput({ interactionContext: context, invoices: [communicationInvoice("invoice-a"), communicationInvoice("invoice-b")], projection: { ...base.projection, collectibleInvoiceIds: ["invoice-a"], excludedInvoiceIds: ["invoice-b"] } }));
    const current = { ...approved.current, invoices: [...approved.current.invoices].reverse() };
    expect(revalidate(approved, current).preparation).toMatchObject({ state: "BLOCKED_BEFORE_SEND", blockers: ["STALE_DRAFT"] });
  });

  it("blocks changed evidence and has no provider or send effects", () => {
    const scenario = approvedScenario();
    const current = { ...scenario.current, invoices: [communicationInvoice("invoice-a", { evidenceRefs: ["ledger:changed"] })] };
    expect(revalidate(scenario, current).preparation.blockers).toEqual(expect.arrayContaining(["EVIDENCE_CHANGED", "STALE_DRAFT"]));
    expect(JSON.stringify(revalidate(scenario))).not.toMatch(/providerMessageId|MESSAGE_SENT|DELIVERED|FAILED/);
  });
});
