import { CommunicationExecutionService, InMemoryCommunicationExecutionStore } from "@/modules/communication-execution";
import type { CommunicationExecutionProvider, CommunicationExecutionStateLoader, CommunicationExecutionStore, ExecuteCommunicationResult } from "@/modules/communication-execution";
import { communicationSnapshotFingerprint } from "@/modules/communication-preparation";
import { ResendEmailProvider, resendConfigFromEnvironment } from "@/modules/email-provider";
import type { EmailHttpClient } from "@/modules/email-provider";
import { CONTROLLED_SMOKE } from "./constants";
import { createControlledSmokeScenario } from "./scenario";

export type ControlledSmokeMode = "DRY_RUN" | "REAL";
export interface ControlledSmokeConfiguration {
  readonly mode: ControlledSmokeMode;
  readonly recipient: string;
  readonly smokeDatabaseUrl?: string;
  readonly providerConfiguration: ReturnType<typeof resendConfigFromEnvironment>;
  readonly smokeEnabled: boolean;
  readonly operatorConfirmed: boolean;
}

export const assertControlledSmokeCliArguments = (argumentsAfterExecutable: readonly string[]): void => {
  if (argumentsAfterExecutable.length) throw new Error("Controlled smoke command accepts no arguments, recipient, contact, channel, or tenant override");
};

export const controlledSmokeConfigurationFromEnvironment = (environment: Readonly<Record<string, string | undefined>>): ControlledSmokeConfiguration => {
  for (const forbidden of ["RECOVERIA_SMOKE_TEST_TENANT_ID", "RECOVERIA_SMOKE_TEST_CASE_ID", "RECOVERIA_SMOKE_TEST_CONTACT_ID", "RECOVERIA_SMOKE_TEST_CHANNEL_ID", "RECOVERIA_SMOKE_TEST_DRAFT_ID"]) if (environment[forbidden]) throw new Error("Controlled smoke synthetic identity cannot be overridden");
  const configuredMode = environment.RECOVERIA_SMOKE_TEST_MODE;
  if (configuredMode && configuredMode !== "DRY_RUN" && configuredMode !== "REAL") throw new Error("Controlled smoke mode must be DRY_RUN or REAL");
  const mode: ControlledSmokeMode = configuredMode === "REAL" ? "REAL" : "DRY_RUN";
  const configuredRecipient = environment.RECOVERIA_SMOKE_TEST_RECIPIENT?.trim().toLowerCase();
  const recipient = configuredRecipient || CONTROLLED_SMOKE.dryRunRecipient;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) throw new Error("Controlled smoke recipient configuration is not an email address");
  const providerConfiguration = resendConfigFromEnvironment(environment);
  const smokeEnabled = environment.RECOVERIA_CONTROLLED_SMOKE_TEST_ENABLED === "true";
  const operatorConfirmed = environment.RECOVERIA_SMOKE_TEST_CONFIRMATION === CONTROLLED_SMOKE.confirmation;
  const allowlist = providerConfiguration.allowedRecipients ?? [];
  if (allowlist.length && (allowlist.length !== 1 || allowlist[0]?.trim().toLowerCase() !== recipient)) throw new Error("Smoke truth recipient and provider allowlist must match exactly");
  if (mode === "REAL") {
    if (!configuredRecipient) throw new Error("Real smoke mode requires an explicit synthetic ContactPoint recipient");
    if (!smokeEnabled) throw new Error("Controlled smoke-test enablement is absent");
    if (!operatorConfirmed) throw new Error("Controlled smoke-test human confirmation is absent");
    if (!providerConfiguration.sendEnabled) throw new Error("Real provider sending is disabled");
    if (!providerConfiguration.apiKey || !providerConfiguration.fromAddress) throw new Error("Real provider credentials or sender are unavailable");
    if (allowlist.length !== 1 || allowlist[0]?.trim().toLowerCase() !== recipient) throw new Error("The resolved smoke recipient is not exactly allowlisted");
    const smokeUrl = environment.RECOVERIA_SMOKE_DATABASE_URL;
    if (!smokeUrl || environment.RECOVERIA_SMOKE_DATABASE_ALLOWLIST !== "recoveria-controlled-smoke") throw new Error("Explicit controlled-smoke database authorization is absent");
    let parsed: URL;
    try { parsed = new URL(smokeUrl); } catch { throw new Error("Controlled-smoke database URL is invalid"); }
    if (!/recoveria/i.test(parsed.pathname) || !/smoke/i.test(parsed.pathname)) throw new Error("Controlled-smoke database is not visibly RecoverIA-specific and smoke-only");
    return { mode, recipient, smokeDatabaseUrl: smokeUrl, providerConfiguration, smokeEnabled, operatorConfirmed };
  }
  return { mode, recipient, providerConfiguration, smokeEnabled, operatorConfirmed };
};

export class ControlledSmokeDryRunProvider implements CommunicationExecutionProvider {
  readonly id = "controlled-smoke-dry-run";
  calls = 0;
  async attempt() { this.calls += 1; return { status: "FAILED" as const, reasonCode: "DRY_RUN_PROVIDER_NETWORK_DISABLED" }; }
}

export const controlledSmokeDryRunOperatorReport = (result: ExecuteCommunicationResult) => ({
  mode: "DRY_RUN" as const,
  providerNetworkCalls: 0,
  realEmailsSent: 0,
  kind: result.kind,
  ...(result.kind === "OUTCOME_RECORDED" ? { reasonCode: result.outcome.reasonCode } : {}),
  readyForExplicitRealGate: result.kind === "OUTCOME_RECORDED",
});

export async function runControlledEmailSmokeTest(input: {
  readonly configuration: ControlledSmokeConfiguration;
  readonly store: CommunicationExecutionStore;
  readonly provider: CommunicationExecutionProvider;
  readonly mutateSafetyAfterInitialization?: () => Promise<void>;
  readonly approvalActor?: { readonly kind: "HUMAN" | "SYSTEM"; readonly id: string };
}): Promise<{ readonly result: ExecuteCommunicationResult; readonly networkExpected: boolean }> {
  if (input.configuration.mode === "REAL" && (!input.configuration.smokeEnabled || !input.configuration.operatorConfirmed)) throw new Error("Real controlled smoke execution lacks immediate enablement or human confirmation");
  const scenario = createControlledSmokeScenario(input.configuration.recipient, input.approvalActor);
  if (scenario.current.organizationId !== CONTROLLED_SMOKE.organizationId || scenario.current.caseId !== CONTROLLED_SMOKE.caseId || scenario.draft.id !== CONTROLLED_SMOKE.draftId) throw new Error("Controlled smoke scenario escaped its synthetic namespace");
  const safety = await input.store.advanceSafetyState({ organizationId: CONTROLLED_SMOKE.organizationId, caseId: CONTROLLED_SMOKE.caseId, safetyFingerprint: scenario.fingerprint, observedAt: scenario.current.interactionContext.asOf });
  await input.mutateSafetyAfterInitialization?.();
  const loader: CommunicationExecutionStateLoader = { load: async request => {
    if (request.organizationId !== CONTROLLED_SMOKE.organizationId || request.caseId !== CONTROLLED_SMOKE.caseId || request.draftId !== CONTROLLED_SMOKE.draftId || request.approvalId !== CONTROLLED_SMOKE.approvalId) throw new Error("Controlled smoke trusted-loader scope mismatch");
    if (communicationSnapshotFingerprint(scenario.current) !== scenario.fingerprint) throw new Error("Controlled smoke current state is inconsistent");
    return { ...safety, current: scenario.current };
  } };
  const result = await new CommunicationExecutionService(input.store, loader, input.provider).execute({ preparation: scenario.preparation, draft: scenario.draft, draftRequest: scenario.draftRequest, approval: scenario.approval, executionRequestedAt: "2026-09-16T12:05:00.000Z" });
  return { result, networkExpected: input.configuration.mode === "REAL" };
}

export const createDefaultDryRunHarness = () => {
  const configuration = controlledSmokeConfigurationFromEnvironment({});
  const store = new InMemoryCommunicationExecutionStore();
  const provider = new ControlledSmokeDryRunProvider();
  return { configuration, store, provider };
};

export const createRealSmokeProvider = (configuration: ControlledSmokeConfiguration, http?: EmailHttpClient): CommunicationExecutionProvider => {
  if (configuration.mode !== "REAL") throw new Error("Real provider cannot be created for dry-run mode");
  return new ResendEmailProvider(configuration.providerConfiguration, http);
};
