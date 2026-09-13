import { describe, expect, it } from "vitest";
import { deriveCollectionInteractionContext, projectCollectionCaseWithInteractionContext } from "@/modules/collection-interactions";
import { resolveCollectionContacts } from "@/modules/contact-relationships";
import { channelOf, contactContextOf, contactOf, relationshipOf } from "@/test/fixtures/phase-5b2a-contact-truth-set";
import { claimOf, disputeOf, interactionCaseOf, interactionInput, interactionOf, promiseOf, verifiedEvent } from "@/test/fixtures/phase-5b2b-interaction-truth-set";
import { invoiceOf } from "@/test/fixtures/phase-5b1-truth-set";
import { communicationCase, communicationInput, communicationInvoice, inputWithInteraction } from "@/test/fixtures/phase-5b3-communication-truth-set";
import { createCommunicationDraftRequest, createCommunicationSendPreparation, createValidatedCommunicationDraft, DeterministicTemplateDraftProvider, evaluateCommunicationPreparation, recordDraftApproval, revalidateCommunicationForSend } from ".";
import type { CommunicationPreparationInput, DraftApproval } from ".";

const requestMeta = { id: "request-send", requestedAt: "2026-09-11T13:00:00.000Z", requestedBy: "operator" };
const preparationMeta = { id: "send-preparation-1", requestedAt: "2026-09-11T14:00:00.000Z", requestedBy: "operator" };

const approvedScenario = (current = communicationInput()) => {
  const evaluation = evaluateCommunicationPreparation(current);
  const draftRequest = createCommunicationDraftRequest(evaluation, requestMeta);
  const draft = createValidatedCommunicationDraft(new DeterministicTemplateDraftProvider(), draftRequest);
  const approval = recordDraftApproval(draft, { id: "approval-send", status: "APPROVED", actorId: "reviewer", decidedAt: "2026-09-11T13:30:00.000Z" });
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
    expect(() => createCommunicationSendPreparation({ ...scenario, ...preparationMeta, approval: { ...scenario.approval, status: "REJECTED" } })).toThrow(/Approved human decision/);
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

  it("does not stale for unrelated chronology or a non-safety display label", () => {
    const base = communicationInput();
    const mixedCase = interactionCaseOf(["invoice-a", "invoice-b"]);
    const approvedContext = deriveCollectionInteractionContext(interactionInput({ case: mixedCase, contactResolution: base.interactionContext.relevantContacts }));
    const approved = approvedScenario(communicationInput({ interactionContext: approvedContext, invoices: [communicationInvoice("invoice-a"), communicationInvoice("invoice-b")], projection: { ...base.projection, collectibleInvoiceIds: ["invoice-a"], excludedInvoiceIds: ["invoice-b"] } }));
    const currentContext = deriveCollectionInteractionContext(interactionInput({ case: mixedCase, contactResolution: base.interactionContext.relevantContacts, interactions: [interactionOf("unrelated", "CONTACT_ATTEMPTED", { channelId: "email-juan", relatedInvoiceIds: ["invoice-b"] })] }));
    const current = { ...approved.current, administrationName: "Etiqueta visual no operativa", interactionContext: currentContext };
    expect(revalidate(approved, current).preparation).toMatchObject({ state: "READY_TO_SEND", blockers: [] });
  });

  it("blocks changed evidence and has no provider or send effects", () => {
    const scenario = approvedScenario();
    const current = { ...scenario.current, invoices: [communicationInvoice("invoice-a", { evidenceRefs: ["ledger:changed"] })] };
    expect(revalidate(scenario, current).preparation.blockers).toEqual(expect.arrayContaining(["EVIDENCE_CHANGED", "STALE_DRAFT"]));
    expect(JSON.stringify(revalidate(scenario))).not.toMatch(/providerMessageId|MESSAGE_SENT|DELIVERED|FAILED/);
  });
});
