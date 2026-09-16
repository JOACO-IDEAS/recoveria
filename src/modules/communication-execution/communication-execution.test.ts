import { describe, expect, it } from "vitest";
import { deriveCollectionInteractionContext } from "@/modules/collection-interactions";
import { resolveCollectionContacts } from "@/modules/contact-relationships";
import { createCommunicationDraftRequest, createCommunicationSendPreparation, createValidatedCommunicationDraft, DeterministicTemplateDraftProvider, evaluateCommunicationPreparation, recordDraftApproval } from "@/modules/communication-preparation";
import { channelOf, contactContextOf, contactOf, relationshipOf } from "@/test/fixtures/phase-5b2a-contact-truth-set";
import { interactionInput } from "@/test/fixtures/phase-5b2b-interaction-truth-set";
import { communicationCase, communicationInput, communicationInvoice, inputWithInteraction } from "@/test/fixtures/phase-5b3-communication-truth-set";
import { CommunicationProviderAttemptError, executeCommunicationBoundary, InMemoryCommunicationExecutionStore, providerRequestKeyFor, recoverInterruptedCommunicationExecution, SimulatedExecutionCrash } from ".";
import type { CommunicationExecutionProvider, CommunicationOutcomeStatus } from ".";

const requestMeta = { id: "execution-request", requestedAt: "2026-09-11T13:00:00.000Z", requestedBy: "operator" };
const preparationMeta = { id: "execution-preparation", requestedAt: "2026-09-11T14:00:00.000Z", requestedBy: "operator" };

class SyntheticProvider implements CommunicationExecutionProvider {
  readonly id = "synthetic-provider";
  calls = 0;
  keys: string[] = [];
  constructor(private readonly behavior: () => Promise<{ status: CommunicationOutcomeStatus; reasonCode: string }>) {}
  async attempt(input: { readonly providerRequestKey: string }) { this.calls += 1; this.keys.push(input.providerRequestKey); return this.behavior(); }
}

const providerResult = (status: CommunicationOutcomeStatus, reasonCode = `SYNTHETIC_${status}`) => new SyntheticProvider(async () => ({ status, reasonCode }));

const approvedScenario = (current = communicationInput(), requestId = requestMeta.id) => {
  const evaluation = evaluateCommunicationPreparation(current);
  const draftRequest = createCommunicationDraftRequest(evaluation, { ...requestMeta, id: requestId });
  const draft = createValidatedCommunicationDraft(new DeterministicTemplateDraftProvider(), draftRequest);
  const approval = recordDraftApproval(draft, { id: `approval:${requestId}`, status: "APPROVED", actor: { kind: "HUMAN", id: "reviewer" }, decidedAt: "2026-09-11T13:30:00.000Z" });
  const preparation = createCommunicationSendPreparation({ draft, draftRequest, approval, ...preparationMeta, id: `preparation:${requestId}` });
  return { current, draftRequest, draft, approval, preparation };
};

const execute = (scenario: ReturnType<typeof approvedScenario>, store: InMemoryCommunicationExecutionStore, provider: CommunicationExecutionProvider, current = scenario.current) => executeCommunicationBoundary({ ...scenario, current, store, provider, asOf: current.interactionContext.asOf, executionRequestedAt: "2026-09-11T14:05:00.000Z" });

const withInvalidContact = (channelStatus?: "INVALID") => {
  const base = communicationInput();
  const juan = contactOf("juan", { displayName: "Juan García" });
  const resolution = resolveCollectionContacts(communicationCase, contactContextOf({ contacts: [juan], channels: [channelOf(juan.id, "email-juan", { type: "EMAIL", status: channelStatus ?? "CONFIRMED", rawValue: "juan@example.invalid", normalizedValue: "juan@example.invalid" })], relationships: [relationshipOf(juan.id, "relationship-juan", channelStatus ? {} : { status: "SUPERSEDED" })] }));
  return { ...base, interactionContext: deriveCollectionInteractionContext(interactionInput({ case: communicationCase, contactResolution: resolution })) };
};

describe("Phase 5B.4B durable communication execution boundary", () => {
  it("creates one execution, immutable attempt, and ACCEPTED outcome", async () => {
    const scenario = approvedScenario(); const store = new InMemoryCommunicationExecutionStore(); const provider = providerResult("ACCEPTED", "PROVIDER_ACKNOWLEDGED");
    const result = await execute(scenario, store, provider);
    expect(result).toMatchObject({ kind: "OUTCOME_RECORDED", execution: { status: "ACCEPTED" }, attempt: { attemptNumber: 1, state: "ATTEMPTING" }, outcome: { status: "ACCEPTED" }, retryEligibility: "NEVER" });
    expect(provider.calls).toBe(1);
    if (result.kind === "OUTCOME_RECORDED") { expect(Object.isFrozen(result.attempt)).toBe(true); expect(await store.attempts(result.execution.id)).toHaveLength(1); expect(await store.outcomes(result.execution.id)).toHaveLength(1); }
  });

  it("deduplicates repeated and concurrent requests so only one claim crosses the provider boundary", async () => {
    const scenario = approvedScenario(); const store = new InMemoryCommunicationExecutionStore(); const provider = providerResult("ACCEPTED");
    const concurrent = await Promise.all([execute(scenario, store, provider), execute(scenario, store, provider)]);
    expect(concurrent.map(result => result.kind).sort()).toEqual(["DUPLICATE_REQUEST", "OUTCOME_RECORDED"]);
    expect(provider.calls).toBe(1);
    const third = await execute(scenario, store, provider);
    expect(third).toMatchObject({ kind: "DUPLICATE_REQUEST", execution: { status: "ACCEPTED" }, retryEligibility: "NEVER" });
    expect(provider.calls).toBe(1);
  });

  it("uses one logical execution for a second approval of the same draft", async () => {
    const first = approvedScenario(); const store = new InMemoryCommunicationExecutionStore(); const provider = providerResult("ACCEPTED");
    const secondApproval = recordDraftApproval(first.draft, { id: "approval:second", status: "APPROVED", actor: { kind: "HUMAN", id: "reviewer-2" }, decidedAt: "2026-09-11T13:45:00.000Z" });
    const second = { ...first, approval: secondApproval, preparation: createCommunicationSendPreparation({ ...preparationMeta, id: "preparation:second", draft: first.draft, draftRequest: first.draftRequest, approval: secondApproval }) };
    const one = await execute(first, store, provider); const two = await execute(second, store, provider);
    expect(one.kind).toBe("OUTCOME_RECORDED"); expect(two.kind).toBe("DUPLICATE_REQUEST"); expect(provider.calls).toBe(1);
    if (one.kind !== "BLOCKED_BEFORE_ATTEMPT" && two.kind === "DUPLICATE_REQUEST") expect(two.execution.id).toBe(one.execution.id);
  });

  it("gives a genuinely new draft a distinct execution and provider request key", async () => {
    const store = new InMemoryCommunicationExecutionStore(); const provider = providerResult("ACCEPTED");
    const first = approvedScenario(); const second = approvedScenario(first.current, "execution-request-2");
    const one = await execute(first, store, provider); const two = await execute(second, store, provider);
    expect(one.kind).toBe("OUTCOME_RECORDED"); expect(two.kind).toBe("OUTCOME_RECORDED");
    expect(provider.keys).toHaveLength(2); expect(provider.keys[0]).not.toBe(provider.keys[1]);
    expect(providerRequestKeyFor(first.draft.organizationId, first.draft.id)).toBe(provider.keys[0]);
  });

  it.each([
    ["balance", (scenario: ReturnType<typeof approvedScenario>) => ({ ...scenario.current, invoices: [communicationInvoice("invoice-a", { outstandingCents: 700_000_00, overdueCents: 700_000_00 })] })],
    ["payment", () => inputWithInteraction({ claim: true })],
    ["dispute", () => inputWithInteraction({ dispute: true })],
    ["contact", () => withInvalidContact()],
    ["channel", () => withInvalidContact("INVALID")],
  ] as const)("blocks stale %s state before attempt creation", async (_name, currentOf) => {
    const scenario = approvedScenario(); const store = new InMemoryCommunicationExecutionStore(); const provider = providerResult("ACCEPTED");
    const result = await execute(scenario, store, provider, currentOf(scenario));
    expect(result.kind).toBe("BLOCKED_BEFORE_ATTEMPT"); expect(provider.calls).toBe(0);
  });

  it("preserves approval provenance and hard-rejects SYSTEM, tenant, and case mismatches", async () => {
    const scenario = approvedScenario(); const store = new InMemoryCommunicationExecutionStore(); const provider = providerResult("ACCEPTED");
    await expect(executeCommunicationBoundary({ ...scenario, approval: { ...scenario.approval, actor: { kind: "SYSTEM", id: "scheduler" } }, store, provider, asOf: scenario.current.interactionContext.asOf, executionRequestedAt: "2026-09-11T14:05:00.000Z" })).rejects.toThrow(/HUMAN/);
    await expect(executeCommunicationBoundary({ ...scenario, current: { ...scenario.current, organizationId: "other" }, store, provider, asOf: scenario.current.interactionContext.asOf, executionRequestedAt: "2026-09-11T14:05:00.000Z" })).rejects.toThrow(/tenant/i);
    await expect(executeCommunicationBoundary({ ...scenario, current: { ...scenario.current, caseId: "other" }, store, provider, asOf: scenario.current.interactionContext.asOf, executionRequestedAt: "2026-09-11T14:05:00.000Z" })).rejects.toThrow(/case/i);
    expect(provider.calls).toBe(0);
  });

  it("records definite rejection and pre-transmission error as FAILED and manually retry-eligible", async () => {
    for (const [index, provider] of [providerResult("FAILED", "PROVIDER_REJECTED_BEFORE_ACCEPTANCE"), new SyntheticProvider(async () => { throw new CommunicationProviderAttemptError("not transmitted", "NOT_STARTED"); })].entries()) {
      const result = await execute(approvedScenario(communicationInput(), `failed-${index}`), new InMemoryCommunicationExecutionStore(), provider);
      expect(result).toMatchObject({ kind: "OUTCOME_RECORDED", execution: { status: "FAILED" }, outcome: { status: "FAILED" }, retryEligibility: "MANUAL_RETRY_ELIGIBLE" });
    }
  });

  it("records ambiguous timeout or possible transmission as UNKNOWN without automatic retry", async () => {
    const providers = [new SyntheticProvider(async () => { throw new Error("synthetic timeout"); }), new SyntheticProvider(async () => { throw new CommunicationProviderAttemptError("connection lost", "MAY_HAVE_STARTED"); }), providerResult("UNKNOWN", "AMBIGUOUS_PROVIDER_RESPONSE"), new SyntheticProvider(async () => ({ status: "SENT" as never, reasonCode: "" }))];
    for (const [index, provider] of providers.entries()) {
      const scenario = approvedScenario(communicationInput(), `unknown-${index}`); const store = new InMemoryCommunicationExecutionStore();
      const result = await execute(scenario, store, provider);
      expect(result).toMatchObject({ kind: "OUTCOME_RECORDED", execution: { status: "UNKNOWN" }, outcome: { status: "UNKNOWN" }, retryEligibility: "RECONCILIATION_REQUIRED" });
      expect((await execute(scenario, store, provider)).kind).toBe("DUPLICATE_REQUEST"); expect(provider.calls).toBe(1);
    }
  });

  it("recovers a crash after durable attempt creation as UNKNOWN", async () => {
    const scenario = approvedScenario(); const store = new InMemoryCommunicationExecutionStore(); const provider = new SyntheticProvider(async () => { throw new SimulatedExecutionCrash("synthetic crash"); });
    await expect(execute(scenario, store, provider)).rejects.toThrow(SimulatedExecutionCrash);
    const executionId = `communication-execution:${providerRequestKeyFor(scenario.draft.organizationId, scenario.draft.id).split(":").at(-1)}`;
    expect((await store.get(executionId))?.status).toBe("ATTEMPTING");
    const recovered = await recoverInterruptedCommunicationExecution(store, executionId, "2026-09-11T14:10:00.000Z");
    expect(recovered.status).toBe("UNKNOWN"); expect(await store.outcomes(executionId)).toMatchObject([{ status: "UNKNOWN", reasonCode: "PROCESS_INTERRUPTED_AFTER_ATTEMPT_CREATION" }]);
  });

  it("keeps provider request identity stable and records no message body in durable records", async () => {
    const scenario = approvedScenario(); const store = new InMemoryCommunicationExecutionStore(); const provider = providerResult("ACCEPTED");
    const result = await execute(scenario, store, provider);
    if (result.kind !== "OUTCOME_RECORDED") throw new Error("Expected recorded outcome");
    expect(result.execution.providerRequestKey).toBe(providerRequestKeyFor(scenario.draft.organizationId, scenario.draft.id));
    expect(JSON.stringify({ execution: result.execution, attempt: result.attempt, outcome: result.outcome })).not.toContain(scenario.draft.body);
  });
});
