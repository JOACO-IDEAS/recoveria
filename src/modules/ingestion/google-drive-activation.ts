import type { DriveCredentialProvider, PilotConnectionState } from "./real-google-drive-client";
import { GOOGLE_DRIVE_READONLY_SCOPE, type AuthenticatedEncryptionPort, type DownloadSecurityAuditSink, type DownloadSecurityEvent, type GoogleDriveOAuthBoundary, type RefreshCredentialVault } from "./google-drive-pilot-infrastructure";

export interface GoogleOAuthTokenSet { readonly accessToken: string; readonly expiresInSeconds: number; readonly refreshToken?: string; readonly grantedScopes: readonly string[]; readonly subject: string }
export interface GoogleOAuthClientPort {
  exchangeAuthorizationCode(input: { readonly code: string; readonly callbackUrl: string }): Promise<GoogleOAuthTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<Omit<GoogleOAuthTokenSet, "refreshToken" | "subject">>;
  revokeCredential(credential: string): Promise<void>;
}
export class UnconfiguredGoogleOAuthClient implements GoogleOAuthClientPort {
  async exchangeAuthorizationCode(input: { readonly code: string; readonly callbackUrl: string }): Promise<never> { void input; throw new Error("GOOGLE_OAUTH_PROVIDER_NOT_CONFIGURED"); }
  async refreshAccessToken(refreshToken: string): Promise<never> { void refreshToken; throw new Error("GOOGLE_OAUTH_PROVIDER_NOT_CONFIGURED"); }
  async revokeCredential(credential: string): Promise<never> { void credential; throw new Error("GOOGLE_OAUTH_PROVIDER_NOT_CONFIGURED"); }
}

export interface ManagedEncryptionProvider {
  encrypt(input: { readonly plaintext: Uint8Array; readonly keyId: string; readonly keyVersion: string; readonly authenticatedContext: Readonly<Record<string, string>> }): Promise<Uint8Array>;
  decrypt(input: { readonly ciphertext: Uint8Array; readonly keyId: string; readonly keyVersion: string; readonly authenticatedContext: Readonly<Record<string, string>> }): Promise<Uint8Array>;
}
export interface ManagedEncryptionConfiguration { readonly configured: boolean; readonly keyId?: string; readonly keyVersion?: string }
export class ManagedKmsEncryptionAdapter implements AuthenticatedEncryptionPort {
  constructor(private readonly config: ManagedEncryptionConfiguration, private readonly provider: ManagedEncryptionProvider) {}
  #configured(): { keyId: string; keyVersion: string } { if (this.config.configured !== true || !this.config.keyId || !this.config.keyVersion) throw new Error("MANAGED_ENCRYPTION_NOT_CONFIGURED"); return { keyId: this.config.keyId, keyVersion: this.config.keyVersion }; }
  async seal(plaintext: Uint8Array, context: { organizationId: string; connectionId: string }): Promise<Uint8Array> { const configuration = this.#configured(); try { return await this.provider.encrypt({ plaintext, ...configuration, authenticatedContext: context }); } catch { throw new Error("MANAGED_ENCRYPTION_FAILED"); } }
  async open(ciphertext: Uint8Array, context: { organizationId: string; connectionId: string }): Promise<Uint8Array> { try { return await this.provider.decrypt({ ciphertext, ...this.#configured(), authenticatedContext: context }); } catch { throw new Error("MANAGED_DECRYPTION_FAILED"); } }
}

export interface CredentialEnvelopeRecord { readonly organizationId: string; readonly connectionId: string; readonly encryptedRefreshCredential: Uint8Array; readonly keyId: string; readonly keyVersion: string; readonly grantedScopes: readonly string[]; readonly providerSubject: string; readonly revision: number; readonly createdAt: string; readonly updatedAt: string }
export interface CredentialEnvelopeRepository { load(organizationId: string, connectionId: string): Promise<CredentialEnvelopeRecord | null>; save(record: Omit<CredentialEnvelopeRecord, "revision">, expectedRevision: number | null): Promise<CredentialEnvelopeRecord>; destroy(organizationId: string, connectionId: string): Promise<void> }
export class InMemoryCredentialEnvelopeRepository implements CredentialEnvelopeRepository {
  readonly #records = new Map<string, CredentialEnvelopeRecord>(); #key(org: string, connection: string): string { return `${org}\0${connection}`; }
  async load(org: string, connection: string): Promise<CredentialEnvelopeRecord | null> { return this.#records.get(this.#key(org, connection)) ?? null; }
  async save(record: Omit<CredentialEnvelopeRecord, "revision">, expectedRevision: number | null): Promise<CredentialEnvelopeRecord> { const key = this.#key(record.organizationId, record.connectionId); const current = this.#records.get(key); if ((current?.revision ?? null) !== expectedRevision) throw new Error("CREDENTIAL_OPTIMISTIC_LOCK_CONFLICT"); const saved = { ...record, revision: (current?.revision ?? 0) + 1 }; this.#records.set(key, saved); return saved; }
  async destroy(org: string, connection: string): Promise<void> { this.#records.delete(this.#key(org, connection)); }
}
export class PersistentRefreshCredentialVault implements RefreshCredentialVault {
  constructor(private readonly encryption: AuthenticatedEncryptionPort, private readonly repository: CredentialEnvelopeRepository, private readonly key: { keyId: string; keyVersion: string }, private readonly now: () => Date = () => new Date()) {}
  async store(input: { organizationId: string; connectionId: string; refreshToken: string }, metadata: { grantedScopes?: readonly string[]; providerSubject?: string } = {}): Promise<void> { const current = await this.repository.load(input.organizationId, input.connectionId); const timestamp = this.now().toISOString(); const encryptedRefreshCredential = await this.encryption.seal(new TextEncoder().encode(input.refreshToken), input); await this.repository.save({ organizationId: input.organizationId, connectionId: input.connectionId, encryptedRefreshCredential, keyId: this.key.keyId, keyVersion: this.key.keyVersion, grantedScopes: metadata.grantedScopes ?? [GOOGLE_DRIVE_READONLY_SCOPE], providerSubject: metadata.providerSubject ?? "unknown", createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp }, current?.revision ?? null); }
  async load(org: string, connection: string): Promise<string> { const record = await this.repository.load(org, connection); if (!record || record.organizationId !== org || record.connectionId !== connection) throw new Error("GOOGLE_CREDENTIAL_UNAVAILABLE"); return new TextDecoder().decode(await this.encryption.open(record.encryptedRefreshCredential, { organizationId: org, connectionId: connection })); }
  async destroy(org: string, connection: string): Promise<void> { await this.repository.destroy(org, connection); }
}

export interface ConnectionLifecycleRecord { readonly organizationId: string; readonly connectionId: string; readonly state: PilotConnectionState; readonly revision: number }
export interface ConnectionLifecycleRepository { load(organizationId: string, connectionId: string): Promise<ConnectionLifecycleRecord | null>; transition(input: { organizationId: string; connectionId: string; from: readonly PilotConnectionState[]; to: PilotConnectionState }): Promise<ConnectionLifecycleRecord> }
export class InMemoryConnectionLifecycleRepository implements ConnectionLifecycleRepository {
  readonly #records = new Map<string, ConnectionLifecycleRecord>(); #key(org: string, connection: string): string { return `${org}\0${connection}`; }
  seed(record: ConnectionLifecycleRecord): void { this.#records.set(this.#key(record.organizationId, record.connectionId), record); }
  async load(org: string, connection: string): Promise<ConnectionLifecycleRecord | null> { return this.#records.get(this.#key(org, connection)) ?? null; }
  async transition(input: { organizationId: string; connectionId: string; from: readonly PilotConnectionState[]; to: PilotConnectionState }): Promise<ConnectionLifecycleRecord> { const key = this.#key(input.organizationId, input.connectionId); const current = this.#records.get(key); const state = current?.state ?? "DISCONNECTED"; if (!input.from.includes(state)) throw new Error("CONNECTION_LIFECYCLE_CONFLICT"); const next = { organizationId: input.organizationId, connectionId: input.connectionId, state: input.to, revision: (current?.revision ?? 0) + 1 }; this.#records.set(key, next); return next; }
}

export interface OAuthCallbackInput { readonly organizationId: string; readonly operatorId: string; readonly connectionId: string; readonly callbackUrl: string; readonly state: string; readonly code?: string; readonly oauthError?: string }
export class GoogleDriveCallbackService {
  constructor(private readonly boundary: GoogleDriveOAuthBoundary, private readonly oauth: GoogleOAuthClientPort, private readonly vault: PersistentRefreshCredentialVault, private readonly lifecycle: ConnectionLifecycleRepository) {}
  async handle(input: OAuthCallbackInput): Promise<{ readonly state: "CONNECTED" }> {
    this.boundary.validateCallback({ ...input, grantedScopes: [GOOGLE_DRIVE_READONLY_SCOPE] });
    if (input.oauthError) throw new Error("GOOGLE_OAUTH_CALLBACK_DENIED");
    if (!input.code) throw new Error("GOOGLE_OAUTH_CODE_MISSING");
    const tokens = await this.oauth.exchangeAuthorizationCode({ code: input.code, callbackUrl: input.callbackUrl });
    if (tokens.grantedScopes.length !== 1 || tokens.grantedScopes[0] !== GOOGLE_DRIVE_READONLY_SCOPE) throw new Error("GOOGLE_OAUTH_SCOPE_MISMATCH");
    if (!tokens.refreshToken) throw new Error("GOOGLE_REFRESH_CREDENTIAL_MISSING");
    await this.vault.store({ organizationId: input.organizationId, connectionId: input.connectionId, refreshToken: tokens.refreshToken }, { grantedScopes: tokens.grantedScopes, providerSubject: tokens.subject });
    await this.lifecycle.transition({ organizationId: input.organizationId, connectionId: input.connectionId, from: ["AUTHORIZATION_PENDING", "REAUTHORIZATION_REQUIRED"], to: "CONNECTED" });
    return { state: "CONNECTED" };
  }
}

export class RefreshingDriveCredentialProvider implements DriveCredentialProvider {
  #cached?: { value: string; expiresAt: number }; #inFlight?: Promise<{ value: string }>;
  constructor(private readonly organizationId: string, private readonly connectionId: string, private readonly vault: RefreshCredentialVault, private readonly oauth: GoogleOAuthClientPort, private readonly lifecycle: ConnectionLifecycleRepository, private readonly now: () => number = Date.now) {}
  async #assertConnected(): Promise<void> { const connection = await this.lifecycle.load(this.organizationId, this.connectionId); if (connection?.state !== "CONNECTED") throw new Error("GOOGLE_CREDENTIAL_LIFECYCLE_NOT_CONNECTED"); }
  async getValidAccessToken(connectionId: string): Promise<{ readonly value: string }> { if (connectionId !== this.connectionId) throw new Error("GOOGLE_CREDENTIAL_CONNECTION_MISMATCH"); await this.#assertConnected(); if (this.#cached && this.#cached.expiresAt - 30_000 > this.now()) return { value: this.#cached.value }; if (this.#inFlight) return this.#inFlight; this.#inFlight = this.#refresh(); try { return await this.#inFlight; } finally { this.#inFlight = undefined; } }
  async #refresh(): Promise<{ value: string }> { try { await this.#assertConnected(); const refreshToken = await this.vault.load(this.organizationId, this.connectionId); await this.#assertConnected(); const token = await this.oauth.refreshAccessToken(refreshToken); await this.#assertConnected(); if (token.grantedScopes.length !== 1 || token.grantedScopes[0] !== GOOGLE_DRIVE_READONLY_SCOPE) throw new Error("GOOGLE_OAUTH_SCOPE_MISMATCH"); this.#cached = { value: token.accessToken, expiresAt: this.now() + token.expiresInSeconds * 1_000 }; return { value: token.accessToken }; } catch (error) { if (error instanceof GoogleOAuthFailure && error.code === "invalid_grant") await this.lifecycle.transition({ organizationId: this.organizationId, connectionId: this.connectionId, from: ["CONNECTED", "REAUTHORIZATION_REQUIRED"], to: "REAUTHORIZATION_REQUIRED" }); throw error; } }
}
export class GoogleOAuthFailure extends Error { constructor(readonly code: "invalid_grant" | "exchange_failed" | "refresh_failed") { super(`GOOGLE_OAUTH_${code.toUpperCase()}`); } }

export interface DurableDriveAuditEvent extends DownloadSecurityEvent { readonly eventType: "CONTENT_DOWNLOAD"; readonly operation: "FILES_DOWNLOAD"; readonly executionId: string; readonly failureClassification?: "AUTHORIZATION" | "RETRYABLE" | "TERMINAL" }
export interface DurableDriveAuditRepository { appendOnly(event: DurableDriveAuditEvent): Promise<void> }
export class DurableDownloadSecurityAuditSink implements DownloadSecurityAuditSink {
  constructor(private readonly repository: DurableDriveAuditRepository, private readonly executionId: string) {}
  async append(event: DownloadSecurityEvent): Promise<void> { await this.repository.appendOnly({ ...event, eventType: "CONTENT_DOWNLOAD", operation: "FILES_DOWNLOAD", executionId: this.executionId }); }
}

export interface PilotActivationLimits { readonly expectedCorpusSize: number; readonly hardMaximumDownloads: number; readonly maximumExpansionRatio: number; readonly maximumPdfBytes: number; readonly maximumPages: number; readonly maximumRetryAttempts: number; readonly maximumExecutionDurationMs: number }
export const PILOT_LIMIT_CEILINGS: PilotActivationLimits = Object.freeze({ expectedCorpusSize: 1_000, hardMaximumDownloads: 2_000, maximumExpansionRatio: 10, maximumPdfBytes: 100 * 1024 * 1024, maximumPages: 1_000, maximumRetryAttempts: 10, maximumExecutionDurationMs: 60 * 60_000 });
export interface PilotActivationConfiguration { readonly activationEnabled: boolean; readonly googleClientId: string; readonly googleClientSecretReference: string; readonly exactCallbackUrl: string; readonly requiredScope: typeof GOOGLE_DRIVE_READONLY_SCOPE; readonly organizationId: string; readonly connectionId: string; readonly authorizedRootId: string; readonly limits: PilotActivationLimits; readonly auditPersistenceConfigured: boolean; readonly credentialVaultConfigured: boolean; readonly checkpointPersistenceConfigured: boolean; readonly oauthProviderConfigured: boolean; readonly encryptionConfigured: boolean }
export type ExternalActivationConfiguration = Readonly<Record<string, string | undefined>>;
const required = (source: ExternalActivationConfiguration, key: string): string => { const value = source[key]?.trim(); if (!value) throw new Error(`PILOT_CONFIG_${key}_REQUIRED`); return value; };
const explicitBoolean = (source: ExternalActivationConfiguration, key: string): boolean => { const value = source[key]; if (value === "true") return true; if (value === "false") return false; throw new Error(`PILOT_CONFIG_${key}_INVALID`); };
const boundedInteger = (source: ExternalActivationConfiguration, key: string, maximum: number): number => { const raw = required(source, key); if (!/^[1-9]\d*$/.test(raw)) throw new Error(`PILOT_CONFIG_${key}_INVALID`); const value = Number(raw); if (!Number.isSafeInteger(value) || value > maximum) throw new Error(`PILOT_CONFIG_${key}_INVALID`); return value; };
const boundedRatio = (source: ExternalActivationConfiguration, key: string, maximum: number): number => { const raw = required(source, key); if (!/^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)$/.test(raw)) throw new Error(`PILOT_CONFIG_${key}_INVALID`); const value = Number(raw); if (!Number.isFinite(value) || value <= 0 || value > maximum) throw new Error(`PILOT_CONFIG_${key}_INVALID`); return value; };
const limitsAreValid = (limits: PilotActivationLimits): boolean => Number.isSafeInteger(limits.expectedCorpusSize) && limits.expectedCorpusSize > 0 && limits.expectedCorpusSize <= PILOT_LIMIT_CEILINGS.expectedCorpusSize && Number.isSafeInteger(limits.hardMaximumDownloads) && limits.hardMaximumDownloads >= limits.expectedCorpusSize && limits.hardMaximumDownloads <= PILOT_LIMIT_CEILINGS.hardMaximumDownloads && Number.isFinite(limits.maximumExpansionRatio) && limits.maximumExpansionRatio > 0 && limits.maximumExpansionRatio <= PILOT_LIMIT_CEILINGS.maximumExpansionRatio && Number.isFinite(limits.expectedCorpusSize * limits.maximumExpansionRatio) && Number.isSafeInteger(limits.maximumPdfBytes) && limits.maximumPdfBytes > 0 && limits.maximumPdfBytes <= PILOT_LIMIT_CEILINGS.maximumPdfBytes && Number.isSafeInteger(limits.maximumPages) && limits.maximumPages > 0 && limits.maximumPages <= PILOT_LIMIT_CEILINGS.maximumPages && Number.isSafeInteger(limits.maximumRetryAttempts) && limits.maximumRetryAttempts > 0 && limits.maximumRetryAttempts <= PILOT_LIMIT_CEILINGS.maximumRetryAttempts && Number.isSafeInteger(limits.maximumExecutionDurationMs) && limits.maximumExecutionDurationMs > 0 && limits.maximumExecutionDurationMs <= PILOT_LIMIT_CEILINGS.maximumExecutionDurationMs;
export function parsePilotActivationConfiguration(source: ExternalActivationConfiguration): PilotActivationConfiguration {
  const requiredScope = required(source, "REQUIRED_SCOPE"); if (requiredScope !== GOOGLE_DRIVE_READONLY_SCOPE) throw new Error("PILOT_CONFIG_REQUIRED_SCOPE_INVALID");
  const exactCallbackUrl = required(source, "EXACT_CALLBACK_URL"); const callback = new URL(exactCallbackUrl); if (callback.protocol !== "https:" || callback.username || callback.password || callback.hash) throw new Error("PILOT_CONFIG_EXACT_CALLBACK_URL_INVALID");
  const limits = { expectedCorpusSize: boundedInteger(source, "EXPECTED_CORPUS_SIZE", PILOT_LIMIT_CEILINGS.expectedCorpusSize), hardMaximumDownloads: boundedInteger(source, "HARD_MAXIMUM_DOWNLOADS", PILOT_LIMIT_CEILINGS.hardMaximumDownloads), maximumExpansionRatio: boundedRatio(source, "MAXIMUM_EXPANSION_RATIO", PILOT_LIMIT_CEILINGS.maximumExpansionRatio), maximumPdfBytes: boundedInteger(source, "MAXIMUM_PDF_BYTES", PILOT_LIMIT_CEILINGS.maximumPdfBytes), maximumPages: boundedInteger(source, "MAXIMUM_PAGES", PILOT_LIMIT_CEILINGS.maximumPages), maximumRetryAttempts: boundedInteger(source, "MAXIMUM_RETRY_ATTEMPTS", PILOT_LIMIT_CEILINGS.maximumRetryAttempts), maximumExecutionDurationMs: boundedInteger(source, "MAXIMUM_EXECUTION_DURATION_MS", PILOT_LIMIT_CEILINGS.maximumExecutionDurationMs) };
  if (!limitsAreValid(limits)) throw new Error("PILOT_CONFIG_LIMITS_INVALID");
  return { activationEnabled: explicitBoolean(source, "ACTIVATION_ENABLED"), googleClientId: required(source, "GOOGLE_CLIENT_ID"), googleClientSecretReference: required(source, "GOOGLE_CLIENT_SECRET_REFERENCE"), exactCallbackUrl, requiredScope: GOOGLE_DRIVE_READONLY_SCOPE, organizationId: required(source, "ORGANIZATION_ID"), connectionId: required(source, "CONNECTION_ID"), authorizedRootId: required(source, "AUTHORIZED_ROOT_ID"), limits, auditPersistenceConfigured: explicitBoolean(source, "AUDIT_PERSISTENCE_CONFIGURED"), credentialVaultConfigured: explicitBoolean(source, "CREDENTIAL_VAULT_CONFIGURED"), checkpointPersistenceConfigured: explicitBoolean(source, "CHECKPOINT_PERSISTENCE_CONFIGURED"), oauthProviderConfigured: explicitBoolean(source, "OAUTH_PROVIDER_CONFIGURED"), encryptionConfigured: explicitBoolean(source, "ENCRYPTION_CONFIGURED") };
}

export interface ActivationPreflightResult { readonly status: "READY" | "NOT_READY"; readonly reasons: readonly string[] }
export function inspectPilotActivation(config: PilotActivationConfiguration | null, lifecycle: PilotConnectionState | null): ActivationPreflightResult {
  if (!config) return { status: "NOT_READY", reasons: ["CONFIGURATION_MISSING"] };
  const reasons: string[] = [];
  if (config.activationEnabled !== true) reasons.push("ACTIVATION_DISABLED");
  if (config.requiredScope !== GOOGLE_DRIVE_READONLY_SCOPE) reasons.push("SCOPE_INVALID");
  if (!config.organizationId) reasons.push("ORGANIZATION_UNBOUND"); if (!config.connectionId) reasons.push("CONNECTION_UNBOUND"); if (!config.authorizedRootId) reasons.push("ROOT_UNBOUND");
  if (!config.encryptionConfigured) reasons.push("ENCRYPTION_NOT_CONFIGURED"); if (!config.credentialVaultConfigured) reasons.push("VAULT_NOT_CONFIGURED"); if (!config.oauthProviderConfigured) reasons.push("OAUTH_PROVIDER_NOT_CONFIGURED"); if (!config.auditPersistenceConfigured) reasons.push("AUDIT_NOT_CONFIGURED"); if (!config.checkpointPersistenceConfigured) reasons.push("CHECKPOINT_NOT_CONFIGURED");
  if (!limitsAreValid(config.limits)) reasons.push("LIMITS_INVALID");
  if (!lifecycle || lifecycle === "REVOKED") reasons.push("LIFECYCLE_INCOMPATIBLE");
  return { status: reasons.length ? "NOT_READY" : "READY", reasons };
}
