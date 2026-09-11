import { describe, expect, it } from "vitest";
import { resolveCollectionContacts } from "@/modules/contact-relationships";
import { channelOf, contactContextOf, contactOf, relationshipOf } from "@/test/fixtures/phase-5b2a-contact-truth-set";
import { claimOf, disputeOf, interactionCaseOf, interactionInput, interactionOf, promiseOf, promisePaymentOf, verifiedEvent } from "@/test/fixtures/phase-5b2b-interaction-truth-set";
import { eventOf, invoiceOf } from "@/test/fixtures/phase-5b1-truth-set";
import { appendInteractionFact, deriveCollectionInteractionContext, projectCollectionCaseWithInteractionContext } from ".";

describe("Phase 5B.2B collection interaction context", () => {
  it("keeps attempt, delivery, and response as independent facts", () => {
    const attempted = deriveCollectionInteractionContext(interactionInput({ interactions: [interactionOf("attempt", "CONTACT_ATTEMPTED")] }));
    expect(attempted.lastContactAttempt?.id).toBe("attempt");
    expect(attempted.lastDelivery).toBeUndefined();
    expect(attempted.lastResponse).toBeUndefined();
    const delivered = deriveCollectionInteractionContext(interactionInput({ interactions: [interactionOf("attempt", "CONTACT_ATTEMPTED"), interactionOf("delivered", "CONTACT_DELIVERED", { occurredAt: "2026-09-04T12:00:00.000Z" })] }));
    expect(delivered.lastDelivery?.id).toBe("delivered");
    expect(delivered.lastResponse).toBeUndefined();
    const responded = deriveCollectionInteractionContext(interactionInput({ interactions: [interactionOf("response", "RESPONSE_RECEIVED")] }));
    expect(responded.lastResponse?.id).toBe("response");
    expect(JSON.stringify(responded)).not.toContain("NO_RESPONSE");
  });

  it("derives active and broken promises from explicit asOf", () => {
    expect(deriveCollectionInteractionContext(interactionInput({ promises: [promiseOf("active")] })).activePromises[0].status).toBe("ACTIVE");
    const broken = promiseOf("broken", { promisedDate: "2026-09-09" });
    const result = deriveCollectionInteractionContext(interactionInput({ promises: [broken] }));
    expect(result.brokenPromises[0].status).toBe("BROKEN");
    expect(result.chronology.map(item => item.kind)).toContain("PROMISE_BROKEN");
  });

  it("requires sufficient confirmed financial truth for fulfillment", () => {
    const promise = promiseOf("financial", { promisedDate: "2026-09-09" });
    const partial = deriveCollectionInteractionContext(interactionInput({ promises: [promise], confirmedPromisePayments: [promisePaymentOf(promise.id, 100_000_00)] }));
    expect(partial.fulfilledPromises).toHaveLength(0);
    expect(partial.brokenPromises[0].confirmedPaidCents).toBe(100_000_00);
    const fulfilled = deriveCollectionInteractionContext(interactionInput({ promises: [promise], confirmedPromisePayments: [promisePaymentOf(promise.id, promise.amountCents)] }));
    expect(fulfilled.fulfilledPromises[0].status).toBe("FULFILLED");
  });

  it("preserves simultaneous promises for different invoices", () => {
    const collectionCase = interactionCaseOf(["invoice-a", "invoice-b"]);
    const promises = [promiseOf("promise-a"), promiseOf("promise-b", { invoiceIds: ["invoice-b"], promisedDate: "2026-09-08" })];
    const result = deriveCollectionInteractionContext(interactionInput({ case: collectionCase, promises }));
    expect(result.activePromises.map(item => item.id)).toEqual(["promise-a"]);
    expect(result.brokenPromises.map(item => item.id)).toEqual(["promise-b"]);
  });

  it("preserves superseded promises as historical typed facts", () => {
    const original = promiseOf("promise-old");
    const replacement = promiseOf("promise-new", { supersedesPromiseId: original.id });
    const result = deriveCollectionInteractionContext(interactionInput({ promises: [original, replacement] }));
    expect(result.supersededPromises.map(item => item.id)).toEqual(["promise-old"]);
    expect(result.activePromises.map(item => item.id)).toEqual(["promise-new"]);
    expect(result.chronology.filter(item => item.kind === "PROMISE")).toHaveLength(2);
  });

  it("keeps payment claims pending until a sanctioned verification event exists", () => {
    const claim = claimOf("claim-a");
    const pending = deriveCollectionInteractionContext(interactionInput({ paymentClaims: [claim] }));
    expect(pending.pendingPaymentClaims[0].status).toBe("PENDING_VERIFICATION");
    const verified = deriveCollectionInteractionContext(interactionInput({ paymentClaims: [claim], collectionEvents: [verifiedEvent(claim.id)] }));
    expect(verified.verifiedPaymentClaims[0].status).toBe("VERIFIED");
    expect(verified.pendingPaymentClaims).toHaveLength(0);
  });

  it("keeps claims observational and cannot change financial balance", () => {
    const context = deriveCollectionInteractionContext(interactionInput({ paymentClaims: [claimOf("claim-safe", { claimedAmountCents: 999_999_00 })] }));
    const projection = projectCollectionCaseWithInteractionContext({ projectionInput: { organizationId: context.organizationId, case: interactionCaseOf(), invoices: [invoiceOf("invoice-a", { outstandingCents: 500_000_00 })], contactAvailable: true, entityConfidence: "CONFIRMED", legalReviewThreshold: false, evidenceRefs: ["balance:authoritative"] }, interactionContext: context, collectionEvents: [] });
    expect(projection.outstandingCents).toBe(500_000_00);
    expect(projection.recommendation.action).toBe("VERIFY_PAYMENT");
  });

  it("derives open, resolved, and superseded invoice-granular disputes", () => {
    const opened = disputeOf("dispute-open");
    const resolved = disputeOf("dispute-resolved", { status: "RESOLVED", supersedesDisputeId: opened.id });
    const result = deriveCollectionInteractionContext(interactionInput({ disputes: [opened, resolved] }));
    expect(result.openDisputes).toHaveLength(0);
    expect(result.resolvedDisputes.map(item => item.id)).toEqual(["dispute-resolved"]);
    expect(result.chronology.filter(item => item.kind === "DISPUTE")).toHaveLength(2);
  });

  it("preserves all four realities in a mixed invoice case and explains precedence", () => {
    const collectionCase = interactionCaseOf(["invoice-a", "invoice-b", "invoice-c", "invoice-d"]);
    const context = deriveCollectionInteractionContext(interactionInput({ case: collectionCase, promises: [promiseOf("promise-a")], paymentClaims: [claimOf("claim-c", { invoiceIds: ["invoice-c"] })], disputes: [disputeOf("dispute-b", { invoiceId: "invoice-b" })] }));
    expect(context.activePromises[0].invoiceIds).toEqual(["invoice-a"]);
    expect(context.openDisputes[0].invoiceId).toBe("invoice-b");
    expect(context.pendingPaymentClaims[0].invoiceIds).toEqual(["invoice-c"]);
    const projection = projectCollectionCaseWithInteractionContext({ projectionInput: { organizationId: context.organizationId, case: collectionCase, invoices: [invoiceOf("invoice-a"), invoiceOf("invoice-b"), invoiceOf("invoice-c"), invoiceOf("invoice-d")], contactAvailable: true, entityConfidence: "CONFIRMED", legalReviewThreshold: false, evidenceRefs: ["mixed:case"] }, interactionContext: context, collectionEvents: [] });
    expect(projection.collectibleInvoiceIds).toEqual(["invoice-a", "invoice-c", "invoice-d"]);
    expect(projection.excludedInvoiceIds).toEqual(["invoice-b"]);
    expect(projection.conditions.map(item => item.condition)).toEqual(expect.arrayContaining(["HAS_ACTIVE_PROMISE", "HAS_DISPUTED_INVOICE", "HAS_PAYMENT_TO_VERIFY"]));
    expect(projection.recommendation).toMatchObject({ action: "VERIFY_PAYMENT", reasons: [{ code: "PAYMENT_TO_VERIFY" }] });
  });

  it("keeps a historical interaction linked to a now-superseded contact", () => {
    const oldContact = contactOf("old");
    const newContact = contactOf("new");
    const oldRelationship = relationshipOf(oldContact.id, "rel-old");
    const newRelationship = relationshipOf(newContact.id, "rel-new", { supersedesRelationshipId: oldRelationship.id });
    const collectionCase = interactionCaseOf();
    const resolution = resolveCollectionContacts(collectionCase, contactContextOf({ contacts: [oldContact, newContact], channels: [channelOf(oldContact.id, "old-channel"), channelOf(newContact.id, "new-channel")], relationships: [oldRelationship, newRelationship] }));
    const result = deriveCollectionInteractionContext(interactionInput({ case: collectionCase, contactResolution: resolution, interactions: [interactionOf("historic", "CONTACT_ATTEMPTED", { contactId: oldContact.id, channelId: "old-channel" })] }));
    expect(result.chronology.find(item => item.id === "interaction:historic")?.contactId).toBe("old");
    expect(result.relevantContacts.ineligibleContacts.find(item => item.contact.id === "old")?.blockers).toContain("SUPERSEDED");
  });

  it("orders chronology deterministically while preserving evidence", () => {
    const interactions = [interactionOf("early", "CONTACT_ATTEMPTED", { occurredAt: "2026-09-03T00:00:00.000Z" }), interactionOf("late", "RESPONSE_RECEIVED", { occurredAt: "2026-09-05T00:00:00.000Z" })];
    const result = deriveCollectionInteractionContext(interactionInput({ interactions }));
    expect(result.chronology.map(item => item.id)).toEqual(["interaction:late", "interaction:early"]);
    expect(result.chronology[0].evidenceRefs).toEqual(["fixture:5b2b:late"]);
  });

  it("is append-only, immutable, deterministic, non-mutating, and has no Date.now dependency", () => {
    const original: readonly ReturnType<typeof interactionOf>[] = [];
    const appended = appendInteractionFact(original, interactionOf("immutable", "CONTACT_ATTEMPTED"));
    expect(original).toHaveLength(0);
    expect(Object.isFrozen(appended)).toBe(true);
    const input = interactionInput({ interactions: appended });
    const before = structuredClone(input);
    const originalNow = Date.now;
    Date.now = () => { throw new Error("Date.now forbidden"); };
    try { expect(deriveCollectionInteractionContext(input)).toEqual(deriveCollectionInteractionContext(input)); } finally { Date.now = originalNow; }
    expect(input).toEqual(before);
  });

  it("hard-rejects cross-tenant facts and requires human-confirmed canonical truth", () => {
    expect(() => deriveCollectionInteractionContext(interactionInput({ interactions: [interactionOf("foreign", "CONTACT_ATTEMPTED", { organizationId: "other" })] }))).toThrow(/Cross-tenant/);
    expect(() => deriveCollectionInteractionContext(interactionInput({ promises: [promiseOf("unconfirmed", { confirmedBy: "" })] }))).toThrow(/human confirmation/);
    expect(() => deriveCollectionInteractionContext(interactionInput({ disputes: [disputeOf("foreign-invoice", { invoiceId: "outside-case" })] }))).toThrow(/Invalid invoice dispute/);
  });

  it("preserves existing dispute safety in the 5B.1 recommendation engine", () => {
    const collectionCase = interactionCaseOf();
    const context = deriveCollectionInteractionContext(interactionInput({ case: collectionCase, promises: [promiseOf("broken-disputed", { promisedDate: "2026-09-01" })], disputes: [disputeOf("open-dispute")] }));
    const projection = projectCollectionCaseWithInteractionContext({ projectionInput: { organizationId: context.organizationId, case: collectionCase, invoices: [invoiceOf("invoice-a")], contactAvailable: true, entityConfidence: "CONFIRMED", legalReviewThreshold: false, evidenceRefs: ["safety:case"] }, interactionContext: context, collectionEvents: [eventOf(collectionCase.id, "opened", "CASE_OPENED")] });
    expect(projection.recommendation.action).toBe("REVIEW_DISPUTE");
    expect(projection.recommendation.blockers.map(item => item.code)).toContain("DISPUTE_BLOCKER");
  });
});
