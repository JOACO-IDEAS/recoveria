import { describe, expect, it } from "vitest";
import { InMemoryCommunicationExecutionStore } from "@/modules/communication-execution";
import type { CommunicationExecutionProvider, CommunicationOutcomeStatus } from "@/modules/communication-execution";
import { InMemoryCommunicationDeliveryStore, ResendDeliveryWebhookService } from "@/modules/delivery-reconciliation";
import { signResendWebhook } from "@/modules/email-provider";
import type { EmailHttpClient } from "@/modules/email-provider";
import { CONTROLLED_SMOKE, ControlledSmokeResendWebhookAdapter, assertControlledSmokeCliArguments, controlledSmokeConfigurationFromEnvironment, controlledSmokeDryRunOperatorReport, createControlledSmokeScenario, createDefaultDryRunHarness, createRealSmokeProvider, runControlledEmailSmokeTest } from ".";

class CountingProvider implements CommunicationExecutionProvider {
  readonly id = "synthetic-controlled-smoke-provider";
  calls = 0;
  constructor(private readonly status: CommunicationOutcomeStatus) {}
  async attempt() { this.calls += 1; return { status: this.status, reasonCode: `SYNTHETIC_${this.status}`, ...(this.status === "ACCEPTED" ? { providerMessageId: "synthetic-message" } : {}) }; }
}

class FakeHttp implements EmailHttpClient {
  calls = 0;
  async post() { this.calls += 1; return { status: 200, body: { id: "synthetic-message" } }; }
}

const realEnvironment = (overrides: Record<string, string | undefined> = {}) => ({
  RECOVERIA_SMOKE_TEST_MODE: "REAL",
  RECOVERIA_SMOKE_TEST_RECIPIENT: "founder-controlled@example.invalid",
  RECOVERIA_CONTROLLED_SMOKE_TEST_ENABLED: "true",
  RECOVERIA_SMOKE_TEST_CONFIRMATION: CONTROLLED_SMOKE.confirmation,
  RECOVERIA_REAL_PROVIDER_SEND_ENABLED: "true",
  RESEND_API_KEY: "synthetic-key",
  RECOVERIA_EMAIL_FROM: "synthetic-sender@example.invalid",
  RECOVERIA_EMAIL_RECIPIENT_ALLOWLIST: "founder-controlled@example.invalid",
  RECOVERIA_SMOKE_DATABASE_URL: "postgresql://redacted.invalid/recoveria_smoke",
  RECOVERIA_SMOKE_DATABASE_ALLOWLIST: "recoveria-controlled-smoke",
  ...overrides,
});

describe("Phase 5B.4C.1 controlled email smoke wiring", () => {
  it("defaults to dry run and executes the local boundary with zero network", async () => {
    const harness = createDefaultDryRunHarness();
    const result = await runControlledEmailSmokeTest(harness);
    expect(harness.configuration.mode).toBe("DRY_RUN");
    expect(result.result).toMatchObject({ kind: "OUTCOME_RECORDED", outcome: { status: "FAILED", reasonCode: "DRY_RUN_PROVIDER_NETWORK_DISABLED" } });
    expect(harness.provider.calls).toBe(1);
    const output = JSON.stringify(controlledSmokeDryRunOperatorReport(result.result));
    expect(JSON.parse(output)).toMatchObject({ kind: "OUTCOME_RECORDED", reasonCode: "DRY_RUN_PROVIDER_NETWORK_DISABLED", providerNetworkCalls: 0, realEmailsSent: 0 });
    expect(output).not.toMatch(/synthetic-key|postgresql:\/\/|authorization|recipient/i);
  });

  it.each([
    ["smoke enablement", { RECOVERIA_CONTROLLED_SMOKE_TEST_ENABLED: undefined }],
    ["provider enablement", { RECOVERIA_REAL_PROVIDER_SEND_ENABLED: undefined }],
    ["credentials", { RESEND_API_KEY: undefined }],
    ["allowlist", { RECOVERIA_EMAIL_RECIPIENT_ALLOWLIST: undefined }],
    ["human confirmation", { RECOVERIA_SMOKE_TEST_CONFIRMATION: undefined }],
    ["smoke database authorization", { RECOVERIA_SMOKE_DATABASE_ALLOWLIST: undefined }],
  ])("fails closed without %s", (_name, override) => expect(() => controlledSmokeConfigurationFromEnvironment(realEnvironment(override))).toThrow());

  it("rejects allowlist mismatch and every external CLI argument", () => {
    expect(() => controlledSmokeConfigurationFromEnvironment(realEnvironment({ RECOVERIA_EMAIL_RECIPIENT_ALLOWLIST: "other@example.invalid" }))).toThrow(/match exactly/i);
    for (const argument of ["--to=x@example.invalid", "--recipient=x@example.invalid", "x@example.invalid", "--contact=other", "--channel=other"]) expect(() => assertControlledSmokeCliArguments([argument])).toThrow(/accepts no arguments/i);
  });

  it("rejects every synthetic identity override, including real-looking caller data", () => {
    for (const key of ["RECOVERIA_SMOKE_TEST_TENANT_ID", "RECOVERIA_SMOKE_TEST_CASE_ID", "RECOVERIA_SMOKE_TEST_CONTACT_ID", "RECOVERIA_SMOKE_TEST_CHANNEL_ID", "RECOVERIA_SMOKE_TEST_DRAFT_ID"]) expect(() => controlledSmokeConfigurationFromEnvironment({ [key]: "client-zero-real-data" })).toThrow(/cannot be overridden/i);
  });

  it("preserves HUMAN approval and rejects SYSTEM approval before provider execution", async () => {
    const config = controlledSmokeConfigurationFromEnvironment({}); const provider = new CountingProvider("ACCEPTED");
    await expect(runControlledEmailSmokeTest({ configuration: config, store: new InMemoryCommunicationExecutionStore(), provider, approvalActor: { kind: "SYSTEM", id: "scheduler" } })).rejects.toThrow(/HUMAN/i);
    expect(provider.calls).toBe(0);
    expect(createControlledSmokeScenario(config.recipient).approval).toMatchObject({ actor: { kind: "HUMAN", id: "controlled-smoke-test-human-operator" }, reason: "Controlled smoke-test human authorization" });
  });

  it("rechecks enablement and human confirmation immediately inside real-mode execution", async () => {
    const configuration = controlledSmokeConfigurationFromEnvironment(realEnvironment()); const provider = new CountingProvider("ACCEPTED");
    await expect(runControlledEmailSmokeTest({ configuration: { ...configuration, operatorConfirmed: false }, store: new InMemoryCommunicationExecutionStore(), provider })).rejects.toThrow(/immediate enablement|confirmation/i);
    await expect(runControlledEmailSmokeTest({ configuration: { ...configuration, smokeEnabled: false }, store: new InMemoryCommunicationExecutionStore(), provider })).rejects.toThrow(/immediate enablement|confirmation/i);
    expect(provider.calls).toBe(0);
  });

  it("blocks stale durable safety state with zero provider calls", async () => {
    const configuration = controlledSmokeConfigurationFromEnvironment({}); const store = new InMemoryCommunicationExecutionStore(); const provider = new CountingProvider("ACCEPTED");
    const result = await runControlledEmailSmokeTest({ configuration, store, provider, mutateSafetyAfterInitialization: async () => { await store.advanceSafetyState({ organizationId: CONTROLLED_SMOKE.organizationId, caseId: CONTROLLED_SMOKE.caseId, safetyFingerprint: "changed", observedAt: CONTROLLED_SMOKE.asOf }); } });
    expect(result.result.kind).toBe("SAFETY_STATE_CHANGED"); expect(provider.calls).toBe(0);
  });

  it.each(["UNKNOWN", "FAILED", "ACCEPTED"] as const)("crosses once for %s and never crosses again for the same draft", async status => {
    const configuration = controlledSmokeConfigurationFromEnvironment({}); const store = new InMemoryCommunicationExecutionStore(); const provider = new CountingProvider(status);
    const first = await runControlledEmailSmokeTest({ configuration, store, provider });
    const second = await runControlledEmailSmokeTest({ configuration, store, provider });
    expect(first.result.kind).toBe("OUTCOME_RECORDED"); expect(second.result.kind).toBe("DUPLICATE_REQUEST"); expect(provider.calls).toBe(1);
  });

  it("uses the actual Resend adapter with a fake HTTP boundary and one crossing", async () => {
    const configuration = controlledSmokeConfigurationFromEnvironment(realEnvironment()); const http = new FakeHttp(); const provider = createRealSmokeProvider(configuration, http); const store = new InMemoryCommunicationExecutionStore();
    const result = await runControlledEmailSmokeTest({ configuration, store, provider });
    expect(result.result).toMatchObject({ kind: "OUTCOME_RECORDED", outcome: { status: "ACCEPTED", providerMessageId: "synthetic-message" } }); expect(http.calls).toBe(1);
    await runControlledEmailSmokeTest({ configuration, store, provider }); expect(http.calls).toBe(1);
  });

  it("builds only fixed synthetic identifiers and unmistakably synthetic content", () => {
    const scenario = createControlledSmokeScenario(CONTROLLED_SMOKE.dryRunRecipient);
    expect([scenario.current.organizationId, scenario.current.caseId, scenario.current.administrationId, scenario.current.buildingId, scenario.current.invoices[0]?.id, scenario.draft.contactId, scenario.draft.channelId, scenario.draft.id].every(value => value?.includes("smoke-test"))).toBe(true);
    expect(scenario.draft.subject).toContain("RECOVERIA TEST");
    expect(scenario.draft.body).toContain("prueba interna"); expect(scenario.draft.body).toContain("No representa una deuda"); expect(scenario.draft.body).not.toMatch(/\$|FAC-|carta documento|pagar/i);
  });

  it("binds webhook ingestion to the fixed smoke tenant and rejects caller tenant input and invalid signatures", async () => {
    const store = new InMemoryCommunicationDeliveryStore(); const providerMessageId = "synthetic-message";
    store.addCorrelation({ organizationId: CONTROLLED_SMOKE.organizationId, executionId: "execution-smoke", attemptId: "attempt-smoke", providerId: "resend-email", providerMessageId });
    const secret = `whsec_${Buffer.from("controlled-smoke-secret").toString("base64")}`; const service = new ResendDeliveryWebhookService(store, secret); const adapter = new ControlledSmokeResendWebhookAdapter(service);
    const rawBody = JSON.stringify({ type: "email.delivered", created_at: CONTROLLED_SMOKE.asOf, data: { email_id: providerMessageId } }); const eventId = "event-smoke"; const timestamp = "1758024000"; const signature = `v1,${signResendWebhook(secret, eventId, timestamp, rawBody)}`;
    expect((await adapter.ingest({ rawBody, eventId, timestamp, signature })).event.organizationId).toBe(CONTROLLED_SMOKE.organizationId);
    await expect(adapter.ingest({ rawBody, eventId: "invalid", timestamp, signature: "v1,invalid" })).rejects.toThrow(/signature/i);
    expect(() => adapter.ingest({ rawBody, eventId, timestamp, signature, organizationId: "caller-tenant" } as never)).toThrow(/does not accept caller tenant/i);
  });
});
