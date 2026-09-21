import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SourceCheckpoint } from "./incremental-corpus-processor";
import type { SourceCheckpointKey } from "./source-checkpoint-store";
import { GOOGLE_DRIVE_READONLY_SCOPE, type DownloadSecurityAuditSink, type DownloadSecurityEvent } from "./google-drive-pilot-infrastructure";
import { inspectPilotActivation, type ConnectionLifecycleRepository, type GoogleOAuthClientPort, type PersistentRefreshCredentialVault, type PilotActivationConfiguration } from "./google-drive-activation";
import type { PilotConnectionState } from "./real-google-drive-client";
import { GoogleDriveTransportError, normalizeGoogleDriveError } from "./real-google-drive-client";
import { DriveSourceFetchError } from "./google-drive-source-contract";

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
export interface DurableOAuthStateRecord { readonly stateHash: string; readonly nonceHash: string; readonly organizationId: string; readonly operatorId: string; readonly connectionId: string; readonly callbackUrl: string; readonly createdAt: string; readonly expiresAt: string; readonly consumedAt?: string; readonly schemaVersion: 1 }
export interface DurableOAuthStateRepository { create(record: DurableOAuthStateRecord): Promise<void>; consume(input: { stateHash: string; nonceHash: string; organizationId: string; operatorId: string; connectionId: string; callbackUrl: string; now: string }): Promise<boolean> }
export class DurableOAuthStateService {
  constructor(private readonly repository: DurableOAuthStateRepository, private readonly now: () => number = Date.now) {}
  async issue(binding: { organizationId: string; operatorId: string; connectionId: string; callbackUrl: string }): Promise<{ state: string; nonce: string }> { const state = randomBytes(32).toString("base64url"); const nonce = randomBytes(32).toString("base64url"); const createdAt = this.now(); await this.repository.create({ stateHash: digest(state), nonceHash: digest(nonce), ...binding, createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(createdAt + 10 * 60_000).toISOString(), schemaVersion: 1 }); return { state, nonce }; }
  async consume(input: { state: string; nonce: string; organizationId: string; operatorId: string; connectionId: string; callbackUrl: string }): Promise<void> { const consumed = await this.repository.consume({ stateHash: digest(input.state), nonceHash: digest(input.nonce), organizationId: input.organizationId, operatorId: input.operatorId, connectionId: input.connectionId, callbackUrl: input.callbackUrl, now: new Date(this.now()).toISOString() }); if (!consumed) throw new Error("GOOGLE_OAUTH_STATE_INVALID_OR_CONSUMED"); }
}
export class InMemoryDurableOAuthStateRepository implements DurableOAuthStateRepository { readonly #records = new Map<string, DurableOAuthStateRecord>(); async create(record: DurableOAuthStateRecord): Promise<void> { if (this.#records.has(record.stateHash)) throw new Error("OAUTH_STATE_CONFLICT"); this.#records.set(record.stateHash, record); } async consume(input: { stateHash: string; nonceHash: string; organizationId: string; operatorId: string; connectionId: string; callbackUrl: string; now: string }): Promise<boolean> { const record = this.#records.get(input.stateHash); if (!record || record.consumedAt || record.nonceHash !== input.nonceHash || record.organizationId !== input.organizationId || record.operatorId !== input.operatorId || record.connectionId !== input.connectionId || record.callbackUrl !== input.callbackUrl || record.expiresAt <= input.now) return false; this.#records.set(input.stateHash, { ...record, consumedAt: input.now }); return true; } }

export interface RuntimeCallbackInput { readonly state: string; readonly nonce: string; readonly organizationId: string; readonly operatorId: string; readonly connectionId: string; readonly callbackUrl: string; readonly code?: string; readonly oauthError?: string }
export class DurableGoogleDriveCallbackRuntime {
  constructor(private readonly states: DurableOAuthStateService, private readonly oauth: GoogleOAuthClientPort, private readonly vault: PersistentRefreshCredentialVault, private readonly lifecycle: ConnectionLifecycleRepository) {}
  async handle(config: PilotActivationConfiguration, input: RuntimeCallbackInput): Promise<{ readonly status: "CONNECTED" }> {
    const lifecycle = await this.lifecycle.load(input.organizationId, input.connectionId);
    if (inspectPilotActivation(config, lifecycle?.state ?? null).status !== "READY" || !lifecycle || !["AUTHORIZATION_PENDING", "REAUTHORIZATION_REQUIRED"].includes(lifecycle.state)) throw new Error("GOOGLE_DRIVE_ACTIVATION_NOT_READY");
    if (config.organizationId !== input.organizationId || config.connectionId !== input.connectionId || config.exactCallbackUrl !== input.callbackUrl) throw new Error("GOOGLE_DRIVE_RUNTIME_BINDING_MISMATCH");
    await this.states.consume(input);
    if (input.oauthError) throw new Error("GOOGLE_OAUTH_CALLBACK_DENIED");
    if (!input.code) throw new Error("GOOGLE_OAUTH_CODE_MISSING");
    const tokens = await this.oauth.exchangeAuthorizationCode({ code: input.code, callbackUrl: input.callbackUrl });
    if (tokens.grantedScopes.length !== 1 || tokens.grantedScopes[0] !== GOOGLE_DRIVE_READONLY_SCOPE || !tokens.refreshToken) throw new Error("GOOGLE_OAUTH_EXCHANGE_INVALID");
    await this.vault.store({ organizationId: input.organizationId, connectionId: input.connectionId, refreshToken: tokens.refreshToken }, { grantedScopes: tokens.grantedScopes, providerSubject: tokens.subject });
    await this.lifecycle.transition({ organizationId: input.organizationId, connectionId: input.connectionId, from: ["AUTHORIZATION_PENDING", "REAUTHORIZATION_REQUIRED"], to: "CONNECTED" });
    return { status: "CONNECTED" };
  }
}

export type PilotExecutionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED";
export interface PilotExecutionRecord { readonly id: string; readonly organizationId: string; readonly connectionId: string; readonly authorizedRootId: string; readonly status: PilotExecutionStatus; readonly configurationVersion: string; readonly startedAt?: string; readonly completedAt?: string; readonly failureClassification?: string; readonly discoveredCount: number; readonly downloadedCount: number; readonly pageCount: number }
export interface PilotExecutionRepository { begin(record: PilotExecutionRecord): Promise<void>; finish(id: string, update: Pick<PilotExecutionRecord, "status" | "completedAt" | "failureClassification" | "discoveredCount" | "downloadedCount" | "pageCount">): Promise<void> }
export class InMemoryPilotExecutionRepository implements PilotExecutionRepository { readonly records = new Map<string, PilotExecutionRecord>(); async begin(record: PilotExecutionRecord): Promise<void> { if ([...this.records.values()].some((item) => item.organizationId === record.organizationId && item.connectionId === record.connectionId && (item.status === "PENDING" || item.status === "RUNNING"))) throw new Error("PILOT_EXECUTION_ALREADY_ACTIVE"); this.records.set(record.id, { ...record, status: "RUNNING" }); } async finish(id: string, update: Pick<PilotExecutionRecord, "status" | "completedAt" | "failureClassification" | "discoveredCount" | "downloadedCount" | "pageCount">): Promise<void> { const prior = this.records.get(id); if (!prior) throw new Error("PILOT_EXECUTION_NOT_FOUND"); this.records.set(id, { ...prior, ...update }); } }
export interface DurableCheckpointPort { available(): Promise<boolean>; load(key: SourceCheckpointKey, connectionId: string): Promise<{ version: number; checkpoint: SourceCheckpoint } | null>; save(key: SourceCheckpointKey, connectionId: string, checkpoint: SourceCheckpoint, expectedVersion: number | null): Promise<void> }
export interface PilotPageDocument { readonly fileId: string; readonly rootId: string; readonly mimeType: string; readonly declaredBytes: number }
export interface PilotRuntimeDriver { listPage(input: { rootId: string; pageToken?: string; signal: AbortSignal }): Promise<{ documents: readonly PilotPageDocument[]; nextPageToken?: string }>; download(input: { fileId: string; maximumBytes: number; signal: AbortSignal }): Promise<Uint8Array> }
export interface OneShotPilotInvocation { readonly operatorConfirmed: true; readonly organizationId: string; readonly connectionId: string; readonly authorizedRootId: string; readonly configurationVersion: string }
export class OneShotGoogleDrivePilotOrchestrator {
  constructor(private readonly lifecycle: ConnectionLifecycleRepository, private readonly executions: PilotExecutionRepository, private readonly audit: DownloadSecurityAuditSink, private readonly checkpoints: DurableCheckpointPort, private readonly driver: PilotRuntimeDriver, private readonly now: () => number = Date.now) {}
  async execute(config: PilotActivationConfiguration, invocation: OneShotPilotInvocation): Promise<PilotExecutionRecord> {
    const connection = await this.lifecycle.load(invocation.organizationId, invocation.connectionId);
    if (inspectPilotActivation(config, connection?.state ?? null).status !== "READY" || connection?.state !== "CONNECTED") throw new Error("GOOGLE_DRIVE_ACTIVATION_NOT_READY");
    if (invocation.operatorConfirmed !== true || invocation.organizationId !== config.organizationId || invocation.connectionId !== config.connectionId || invocation.authorizedRootId !== config.authorizedRootId) throw new Error("PILOT_EXECUTION_BINDING_MISMATCH");
    if (!(await this.checkpoints.available())) throw new Error("PILOT_CHECKPOINT_UNAVAILABLE");
    const id = randomUUID(); const startedAtMs = this.now();
    const base: PilotExecutionRecord = { id, organizationId: invocation.organizationId, connectionId: invocation.connectionId, authorizedRootId: invocation.authorizedRootId, status: "PENDING", configurationVersion: invocation.configurationVersion, startedAt: new Date(startedAtMs).toISOString(), discoveredCount: 0, downloadedCount: 0, pageCount: 0 };
    await this.executions.begin(base);
    const controller = new AbortController(); const deadline = startedAtMs + config.limits.maximumExecutionDurationMs;
    const timer = setTimeout(() => controller.abort(), config.limits.maximumExecutionDurationMs);
    let discoveredCount = 0; let downloadedCount = 0; let pageCount = 0;
    const assertDeadline = () => { if (controller.signal.aborted || this.now() >= deadline) { controller.abort(); throw new Error("PILOT_EXECUTION_TIMEOUT"); } };
    try {
      let pageToken: string | undefined;
      do {
        assertDeadline(); if (++pageCount > config.limits.maximumPages) throw new Error("PILOT_PAGE_LIMIT_EXCEEDED");
        const page = await this.#retry(() => this.driver.listPage({ rootId: config.authorizedRootId, pageToken, signal: controller.signal }), config.limits.maximumRetryAttempts, assertDeadline, controller.signal);
        discoveredCount += page.documents.length;
        const anomalyLimit = Math.min(config.limits.hardMaximumDownloads, Math.ceil(config.limits.expectedCorpusSize * config.limits.maximumExpansionRatio));
        if (!Number.isFinite(anomalyLimit) || discoveredCount > anomalyLimit) throw new Error("PILOT_CORPUS_ANOMALY_LIMIT_EXCEEDED");
        for (const document of page.documents) {
          assertDeadline();
          if (document.rootId !== config.authorizedRootId) throw new Error("PILOT_ROOT_BINDING_VIOLATION");
          if (document.mimeType !== "application/pdf") continue;
          if (document.declaredBytes > config.limits.maximumPdfBytes) throw new Error("PILOT_PDF_LIMIT_EXCEEDED");
          if (++downloadedCount > config.limits.hardMaximumDownloads || downloadedCount > anomalyLimit) throw new Error("PILOT_DOWNLOAD_LIMIT_EXCEEDED");
          const reference = digest(`${config.connectionId}\0${document.fileId}`);
          const started: DownloadSecurityEvent = { organizationId: config.organizationId, connectionId: config.connectionId, documentReference: reference, timestamp: new Date(this.now()).toISOString(), rootProof: "PASSED", outcome: "STARTED" };
          await this.audit.append(started);
          try {
            const bytes = await this.#retry(() => this.driver.download({ fileId: document.fileId, maximumBytes: config.limits.maximumPdfBytes, signal: controller.signal }), config.limits.maximumRetryAttempts, assertDeadline, controller.signal);
            assertDeadline();
            if (bytes.byteLength > config.limits.maximumPdfBytes) throw new Error("PILOT_PDF_LIMIT_EXCEEDED");
            await this.audit.append({ ...started, timestamp: new Date(this.now()).toISOString(), outcome: "SUCCEEDED" });
          } catch (error) { await this.audit.append({ ...started, timestamp: new Date(this.now()).toISOString(), outcome: "FAILED" }); throw error; }
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      assertDeadline();
      const completedAt = new Date(this.now()).toISOString();
      await this.executions.finish(id, { status: "SUCCEEDED", completedAt, failureClassification: undefined, discoveredCount, downloadedCount, pageCount });
      return { ...base, status: "SUCCEEDED", completedAt, discoveredCount, downloadedCount, pageCount };
    } catch (error) {
      const timedOut = controller.signal.aborted || (error instanceof Error && error.message === "PILOT_EXECUTION_TIMEOUT");
      const completedAt = new Date(this.now()).toISOString(); const status = timedOut ? "ABORTED" : "FAILED";
      await this.executions.finish(id, { status, completedAt, failureClassification: timedOut ? "TIMEOUT" : "TERMINAL", discoveredCount, downloadedCount, pageCount });
      throw error;
    } finally { clearTimeout(timer); }
  }
  async #awaitDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> { if (signal.aborted) throw new Error("PILOT_EXECUTION_TIMEOUT"); return new Promise<T>((resolve, reject) => { const aborted = () => reject(new Error("PILOT_EXECUTION_TIMEOUT")); signal.addEventListener("abort", aborted, { once: true }); operation.then(value => { signal.removeEventListener("abort", aborted); resolve(value); }, error => { signal.removeEventListener("abort", aborted); reject(error); }); }); }
  async #retry<T>(operation: () => Promise<T>, maximumAttempts: number, assertDeadline: () => void, signal: AbortSignal): Promise<T> { for (let attempt = 1; ; attempt++) { assertDeadline(); try { return await this.#awaitDeadline(operation(), signal); } catch (error) { if (error instanceof Error && error.message === "PILOT_EXECUTION_TIMEOUT") throw error; const retryable = error instanceof DriveSourceFetchError ? error.retryable : error instanceof GoogleDriveTransportError ? normalizeGoogleDriveError(error).retryable : false; if (!retryable || attempt >= maximumAttempts) throw error; } } }
}

export interface RevokePlan { readonly steps: readonly ["PROVIDER_REVOKE", "LOCAL_CREDENTIAL_DESTROY", "LIFECYCLE_REVOKED"]; readonly implemented: false }
export const DEFERRED_REVOKE_PLAN: RevokePlan = { steps: ["PROVIDER_REVOKE", "LOCAL_CREDENTIAL_DESTROY", "LIFECYCLE_REVOKED"], implemented: false };
export const stateAllowsToken = (state: PilotConnectionState | null): boolean => state === "CONNECTED";
