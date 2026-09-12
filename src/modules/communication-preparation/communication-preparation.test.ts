import { describe, expect, it } from "vitest";
import { deriveCollectionInteractionContext, projectCollectionCaseWithInteractionContext } from "@/modules/collection-interactions";
import { resolveCollectionContacts } from "@/modules/contact-relationships";
import { channelOf, contactContextOf, contactOf, relationshipOf } from "@/test/fixtures/phase-5b2a-contact-truth-set";
import { claimOf, interactionInput, promiseOf, verifiedEvent } from "@/test/fixtures/phase-5b2b-interaction-truth-set";
import { invoiceOf } from "@/test/fixtures/phase-5b1-truth-set";
import { communicationCase, communicationInput, communicationInvoice, inputWithInteraction } from "@/test/fixtures/phase-5b3-communication-truth-set";
import { createCommunicationDraftRequest, createValidatedCommunicationDraft, DeterministicTemplateDraftProvider, evaluateCommunicationPreparation, isCommunicationDraftStale, recordDraftApproval, validateCommunicationDraft } from ".";
import type { CommunicationDraftProvider } from ".";

const requestMeta = { id: "request-1", requestedAt: "2026-09-11T14:00:00.000Z", requestedBy: "operator" };
const readyDraft = (input = communicationInput()) => {
  const evaluation = evaluateCommunicationPreparation(input);
  const request = createCommunicationDraftRequest(evaluation, requestMeta);
  return { evaluation, request, draft: createValidatedCommunicationDraft(new DeterministicTemplateDraftProvider(), request) };
};

describe("Phase 5B.3 communication preparation", () => {
  it("prepares a deterministic email draft for one eligible contact and channel", () => {
    const { evaluation, draft } = readyDraft();
    expect(evaluation.outcome).toBe("READY_FOR_DRAFT");
    expect(evaluation.intent).toBe("INITIAL_COLLECTION_CONTACT");
    expect(draft).toMatchObject({ channel: "EMAIL", requiresHumanApproval: true, draftingMethod: "DETERMINISTIC_TEMPLATE" });
    expect(draft.body).toContain("$800.000");
    expect(evaluation.authorizedFacts?.facts.every(fact => ["FACT", "INTERPRETATION", "UNCERTAINTY", "BLOCKER", "RECOMMENDATION", "HUMAN_DECISION"].includes(fact.category))).toBe(true);
  });

  it("prepares WhatsApp without treating PHONE as draftable", () => {
    const juan = contactOf("juan", { displayName: "Juan García" });
    const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "whatsapp-juan")], relationships: [relationshipOf(juan.id, "rel-juan")] }));
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: resolution }));
    expect(readyDraft(communicationInput({ interactionContext: context })).draft.channel).toBe("WHATSAPP");
    const phoneResolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "phone-juan", { type: "PHONE" })], relationships: [relationshipOf(juan.id, "rel-phone")] }));
    const phoneContext = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: phoneResolution }));
    expect(evaluateCommunicationPreparation(communicationInput({ interactionContext: phoneContext })).blockers).toContain("NO_DRAFTABLE_CHANNEL");
  });

  it("requires selection for multiple contacts", () => {
    const juan = contactOf("juan"); const maria = contactOf("maria");
    const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan, maria], channels: [channelOf(juan.id, "email-juan", { type: "EMAIL" }), channelOf(maria.id, "email-maria", { type: "EMAIL" })], relationships: [relationshipOf(juan.id, "rel-juan"), relationshipOf(maria.id, "rel-maria")] }));
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: resolution }));
    const result = evaluateCommunicationPreparation(communicationInput({ interactionContext: context }));
    expect(result.outcome).toBe("REVIEW_REQUIRED"); expect(result.selectionRequirements).toContain("CONTACT_SELECTION_REQUIRED");
  });

  it("requires selection for multiple channels", () => {
    const juan = contactOf("juan");
    const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "email-juan", { type: "EMAIL" }), channelOf(juan.id, "whatsapp-juan")], relationships: [relationshipOf(juan.id, "rel-juan")] }));
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: resolution }));
    const result = evaluateCommunicationPreparation(communicationInput({ interactionContext: context }));
    expect(result.outcome).toBe("REVIEW_REQUIRED"); expect(result.selectionRequirements).toContain("CHANNEL_SELECTION_REQUIRED");
  });

  it("does not make a review-required contact draft-ready", () => {
    const juan = contactOf("juan", { status: "UNVERIFIED" });
    const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], relationships: [relationshipOf(juan.id, "rel-review")] }));
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: resolution }));
    expect(evaluateCommunicationPreparation(communicationInput({ interactionContext: context }))).toMatchObject({ outcome: "REVIEW_REQUIRED", blockers: ["CONTACT_REVIEW_REQUIRED"] });
  });

  it.each([
    ["open dispute", inputWithInteraction({ dispute: true }), "ACTION_NOT_DRAFTABLE"],
    ["active promise", inputWithInteraction({ promise: "ACTIVE" }), "ACTIVE_PROMISE_WAIT"],
    ["zero balance", inputWithInteraction({ zero: true }), "ZERO_BALANCE"],
    ["legal review", inputWithInteraction({ legal: true }), "LEGAL_REVIEW"],
  ] as const)("blocks ordinary drafting for %s", (_name, input, blocker) => {
    const result = evaluateCommunicationPreparation(input);
    expect(result.outcome).toBe("BLOCKED"); expect(result.blockers).toContain(blocker);
  });

  it("allows only a neutral payment-verification request for a pending claim", () => {
    const input = inputWithInteraction({ claim: true });
    const { evaluation, draft } = readyDraft(input);
    expect(evaluation.intent).toBe("PAYMENT_VERIFICATION_REQUEST");
    expect(draft.body).toContain("todavía estamos verificando"); expect(draft.body).not.toMatch(/no pag[oó]|pago no existe/i);
    const unsafe = { ...draft, body: "Hola Juan García, no pagaron." };
    expect(validateCommunicationDraft(unsafe, createCommunicationDraftRequest(evaluation, requestMeta)).errors).toContain("PAYMENT_FAILURE_UNSUPPORTED");
    expect(evaluateCommunicationPreparation({ ...input, allowPaymentVerificationRequest: false }).outcome).toBe("BLOCKED");
  });

  it("allows promise language only for a safely supported broken promise", () => {
    const { evaluation, draft } = readyDraft(inputWithInteraction({ promise: "BROKEN" }));
    expect(evaluation.intent).toBe("PROMISE_FOLLOW_UP");
    expect(evaluation.authorizedFacts?.relevantPromise?.promisedDate).toBe("2026-09-09");
    expect(draft.body).toContain("compromiso de pago registrado");
  });

  it("does not authorize broken-promise language after compatible verified fulfillment", () => {
    const base = communicationInput();
    const promise = promiseOf("promise-fulfilled", { promisedDate: "2026-09-09" });
    const claim = claimOf("claim-fulfilled", { claimedAmountCents: promise.amountCents });
    const verification = verifiedEvent(claim.id);
    const context = deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: base.interactionContext.relevantContacts, promises: [promise], paymentClaims: [claim], collectionEvents: [verification] }));
    const projection = projectCollectionCaseWithInteractionContext({ projectionInput: { organizationId: communicationCase.organizationId, case: communicationCase, invoices: [invoiceOf("invoice-a")], contactAvailable: true, entityConfidence: "CONFIRMED", legalReviewThreshold: false, evidenceRefs: ["fulfilled:safe"] }, interactionContext: context, collectionEvents: [verification] });
    const evaluation = evaluateCommunicationPreparation(communicationInput({ interactionContext: context, projection }));
    expect(context.brokenPromises).toHaveLength(0);
    expect(evaluation.authorizedFacts?.relevantPromise).toBeUndefined();
    if (evaluation.outcome === "READY_FOR_DRAFT") expect(createValidatedCommunicationDraft(new DeterministicTemplateDraftProvider(), createCommunicationDraftRequest(evaluation, requestMeta)).body).not.toMatch(/incumpli/i);
  });

  it("blocks unresolved entity ambiguity", () => {
    const base = communicationInput();
    const projection = { ...base.projection, conditions: [...base.projection.conditions, { condition: "ENTITY_UNCERTAIN" as const, reason: "Ambigua", evidenceRefs: ["entity:ambiguous"], relatedInvoiceIds: [] }] };
    expect(evaluateCommunicationPreparation({ ...base, projection }).blockers).toContain("ENTITY_UNCERTAIN");
  });

  it("filters a mixed case to its eligible invoice subset", () => {
    const base = communicationInput();
    const authorized = evaluateCommunicationPreparation({ ...base, invoices: [communicationInvoice("invoice-a"), communicationInvoice("invoice-b")], projection: { ...base.projection, collectibleInvoiceIds: ["invoice-a"], excludedInvoiceIds: ["invoice-b"] } }).authorizedFacts!;
    expect(authorized.includedInvoiceIds).toEqual(["invoice-a"]);
    expect(authorized.excludedInvoices).toEqual([{ invoiceId: "invoice-b", reasons: ["NOT_COLLECTIBLE"] }]);
    expect(authorized.targetOutstandingCents).toBe(800_000_00);
  });

  it("rejects hallucinated amounts, invoices, legal threats, and promise claims", () => {
    const evaluation = evaluateCommunicationPreparation(communicationInput());
    const request = createCommunicationDraftRequest(evaluation, requestMeta);
    const baseline = new DeterministicTemplateDraftProvider().draft(request);
    const unsafe = { ...baseline, body: "Hola Juan García, debe abonar $9.999.999 por FAC-999. Se iniciarán acciones legales. Promesa incumplida." };
    const result = validateCommunicationDraft(unsafe, request);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(["UNSUPPORTED_AMOUNT", "UNSUPPORTED_INVOICE_NUMBER", "LEGAL_LANGUAGE_PROHIBITED", "BROKEN_PROMISE_UNSUPPORTED"]));
    const provider: CommunicationDraftProvider = { id: "unsafe", draft: () => unsafe };
    expect(() => createValidatedCommunicationDraft(provider, request)).toThrow(/Unsafe communication draft/);
  });

  it("detects stale snapshots", () => {
    const input = communicationInput(); const { draft } = readyDraft(input);
    expect(isCommunicationDraftStale(draft, input)).toBe(false);
    expect(isCommunicationDraftStale(draft, { ...input, invoices: [communicationInvoice("invoice-a", { outstandingCents: 700_000_00 })] })).toBe(true);
  });

  it("records human approval without sending", () => {
    const { draft } = readyDraft();
    const approval = recordDraftApproval(draft, { id: "approval-1", status: "APPROVED", actorId: "reviewer", decidedAt: "2026-09-11T15:00:00.000Z" });
    expect(approval).toMatchObject({ draftId: draft.id, status: "APPROVED", actorId: "reviewer" });
    expect(JSON.stringify(approval)).not.toMatch(/sent|provider|delivery/i);
  });

  it("hard-rejects tenant and administration mismatches", () => {
    expect(() => evaluateCommunicationPreparation({ ...communicationInput(), organizationId: "other" })).toThrow(/Cross-tenant/);
    expect(() => evaluateCommunicationPreparation({ ...communicationInput(), administrationId: "other" })).toThrow(/administration/);
  });

  it("is deterministic, immutable, non-mutating, and has no send side effects", () => {
    const input = communicationInput(); const before = structuredClone(input);
    const first = evaluateCommunicationPreparation(input); const second = evaluateCommunicationPreparation(input);
    expect(first).toEqual(second); expect(Object.isFrozen(first)).toBe(true); expect(input).toEqual(before);
    expect(JSON.stringify(readyDraft(input).draft)).not.toMatch(/MESSAGE_SENT|sendAt|providerMessageId/);
  });
});
