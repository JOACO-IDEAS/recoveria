import { createHash, randomUUID } from "node:crypto";
import type { ConnectedSourceSyncSummary } from "./product-contract";

export type SourceHealth = "NOT_CONFIGURED" | "READY" | "SYNCING" | "UP_TO_DATE" | "REVIEW_REQUIRED" | "ERROR" | "DISCONNECTED";
export interface ConnectedSourceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: "GOOGLE_DRIVE";
  readonly providerConnectionId: string;
  readonly providerRootReference?: string;
  readonly rootDisplayName?: string;
  readonly rootConfirmedBy?: string;
  readonly rootConfirmedAt?: string;
  readonly rootBoundaryVersion: number;
  readonly health: SourceHealth;
  readonly lastAttemptedSyncAt?: string;
  readonly lastSuccessfulSyncAt?: string;
  readonly committedDocumentCount: number;
  readonly reviewRequiredCount: number;
  readonly revision: number;
}

export interface ConnectedSourceRepository {
  find(organizationId: string, connectedSourceId: string): Promise<ConnectedSourceRecord | null>;
  findByConnection(organizationId: string, connectionId: string): Promise<ConnectedSourceRecord | null>;
  save(record: ConnectedSourceRecord, expectedRevision: number | null): Promise<ConnectedSourceRecord>;
}

export class InMemoryConnectedSourceRepository implements ConnectedSourceRepository {
  readonly records = new Map<string, ConnectedSourceRecord>();
  async find(organizationId: string, id: string): Promise<ConnectedSourceRecord | null> { const row = this.records.get(id); return row?.organizationId === organizationId ? row : null; }
  async findByConnection(organizationId: string, connectionId: string): Promise<ConnectedSourceRecord | null> { return [...this.records.values()].find(row => row.organizationId === organizationId && row.providerConnectionId === connectionId) ?? null; }
  async save(record: ConnectedSourceRecord, expectedRevision: number | null): Promise<ConnectedSourceRecord> {
    const current = this.records.get(record.id);
    if ((current?.revision ?? null) !== expectedRevision) throw new Error("CONNECTED_SOURCE_OPTIMISTIC_LOCK_CONFLICT");
    const saved = { ...record, revision: (current?.revision ?? 0) + 1 };
    this.records.set(record.id, saved);
    return saved;
  }
}

export interface FolderCandidate { readonly candidateId: string; readonly organizationId: string; readonly connectionId: string; readonly actorId: string; readonly sessionBindingHash: string; readonly providerRootReference: string; readonly safeDisplayName: string; readonly expiresAt: string; readonly consumedAt?: string }
export interface FolderCandidateRepository { create(candidate: FolderCandidate): Promise<void>; consume(input: { organizationId: string; connectionId: string; candidateId: string; actorId: string; sessionBindingHash: string; now: string }): Promise<FolderCandidate | null> }
export class InMemoryFolderCandidateRepository implements FolderCandidateRepository {
  readonly records = new Map<string, FolderCandidate>();
  async create(candidate: FolderCandidate): Promise<void> { this.records.set(candidate.candidateId, candidate); }
  async consume(input: { organizationId: string; connectionId: string; candidateId: string; actorId: string; sessionBindingHash: string; now: string }): Promise<FolderCandidate | null> { const candidate = this.records.get(input.candidateId); if (!candidate || candidate.organizationId !== input.organizationId || candidate.connectionId !== input.connectionId || candidate.actorId !== input.actorId || candidate.sessionBindingHash !== input.sessionBindingHash || candidate.expiresAt <= input.now || candidate.consumedAt) return null; const consumed = { ...candidate, consumedAt: input.now }; this.records.set(input.candidateId, consumed); return consumed; }
}

export interface GoogleFolderValidator { validate(input: { organizationId: string; connectionId: string; untrustedFolderId: string }): Promise<{ providerRootReference: string; safeDisplayName: string; mimeType: "application/vnd.google-apps.folder"; trashed: false; location: "MY_DRIVE" }> }
export interface ConnectedSourceSyncEngine { execute(input: { organizationId: string; connectionId: string; providerRootReference: string; rootBoundaryVersion: number; actorId: string; executionId: string }): Promise<ConnectedSourceSyncSummary> }

export type SyncIntentStatus = "RUNNING" | "SUCCEEDED" | "FAILED";
export interface SyncIntentRecord { readonly organizationId: string; readonly connectedSourceId: string; readonly syncIntentId: string; readonly actorId: string; readonly sessionBindingHash: string; readonly executionId: string; readonly status: SyncIntentStatus; readonly summary?: ConnectedSourceSyncSummary; readonly failureCode?: string }
export interface SyncIntentRepository { claim(record: SyncIntentRecord): Promise<{ created: boolean; record: SyncIntentRecord }>; complete(input: { organizationId: string; connectedSourceId: string; syncIntentId: string; status: "SUCCEEDED" | "FAILED"; summary?: ConnectedSourceSyncSummary; failureCode?: string }): Promise<SyncIntentRecord> }
export class InMemorySyncIntentRepository implements SyncIntentRepository {
  readonly records = new Map<string, SyncIntentRecord>();
  #key(input: Pick<SyncIntentRecord, "organizationId" | "connectedSourceId" | "syncIntentId">): string { return `${input.organizationId}\0${input.connectedSourceId}\0${input.syncIntentId}`; }
  async claim(record: SyncIntentRecord): Promise<{ created: boolean; record: SyncIntentRecord }> { const key = this.#key(record); const prior = this.records.get(key) ?? [...this.records.values()].find(item => item.organizationId === record.organizationId && item.syncIntentId === record.syncIntentId); if (prior) return { created: false, record: prior }; this.records.set(key, record); return { created: true, record }; }
  async complete(input: { organizationId: string; connectedSourceId: string; syncIntentId: string; status: "SUCCEEDED" | "FAILED"; summary?: ConnectedSourceSyncSummary; failureCode?: string }): Promise<SyncIntentRecord> { const key = this.#key(input); const prior = this.records.get(key); if (!prior || prior.status !== "RUNNING") throw new Error("CONNECTED_SOURCE_SYNC_INTENT_STATE_CONFLICT"); const completed = { ...prior, ...input }; this.records.set(key, completed); return completed; }
}
export type SyncIntentOutcome = { readonly status: SyncIntentStatus; readonly executionId: string; readonly summary?: ConnectedSourceSyncSummary; readonly failureCode?: string; readonly replay: boolean };

export interface ProductActor { readonly organizationId: string; readonly actorId: string; readonly sessionId: string; readonly csrfToken: string }
export function authorizeMutation(actor: ProductActor, input: { organizationId: string; csrfToken: string }): void {
  if (actor.organizationId !== input.organizationId) throw new Error("CONNECTED_SOURCE_TENANT_MISMATCH");
  if (!input.csrfToken || input.csrfToken !== actor.csrfToken) throw new Error("CONNECTED_SOURCE_CSRF_REJECTED");
}

export class ConnectedSourceService {
  constructor(private readonly sources: ConnectedSourceRepository, private readonly candidates: FolderCandidateRepository, private readonly folders: GoogleFolderValidator, private readonly syncEngine: ConnectedSourceSyncEngine, private readonly now: () => Date = () => new Date(), private readonly intents: SyncIntentRepository = new InMemorySyncIntentRepository()) {}

  async ensureConnection(organizationId: string, connectionId: string): Promise<ConnectedSourceRecord> {
    const existing = await this.sources.findByConnection(organizationId, connectionId);
    if (existing) return existing;
    return this.sources.save({ id: randomUUID(), organizationId, provider: "GOOGLE_DRIVE", providerConnectionId: connectionId, rootBoundaryVersion: 0, health: "NOT_CONFIGURED", committedDocumentCount: 0, reviewRequiredCount: 0, revision: 0 }, null);
  }

  async validateFolder(actor: ProductActor, input: { connectedSourceId: string; csrfToken: string; untrustedFolderId: string }): Promise<{ candidateId: string; displayName: string }> {
    authorizeMutation(actor, { organizationId: actor.organizationId, csrfToken: input.csrfToken });
    const source = await this.#require(actor.organizationId, input.connectedSourceId);
    const folder = await this.folders.validate({ organizationId: actor.organizationId, connectionId: source.providerConnectionId, untrustedFolderId: input.untrustedFolderId });
    const candidateId = randomUUID();
    await this.candidates.create({ candidateId, organizationId: actor.organizationId, connectionId: source.providerConnectionId, actorId: actor.actorId, sessionBindingHash: createHash("sha256").update(actor.sessionId).digest("hex"), providerRootReference: folder.providerRootReference, safeDisplayName: folder.safeDisplayName, expiresAt: new Date(this.now().getTime() + 10 * 60_000).toISOString() });
    return { candidateId, displayName: folder.safeDisplayName };
  }

  async confirmFolder(actor: ProductActor, input: { connectedSourceId: string; candidateId: string; csrfToken: string }): Promise<ConnectedSourceRecord> {
    authorizeMutation(actor, { organizationId: actor.organizationId, csrfToken: input.csrfToken });
    const source = await this.#require(actor.organizationId, input.connectedSourceId);
    const candidate = await this.candidates.consume({ organizationId: actor.organizationId, connectionId: source.providerConnectionId, candidateId: input.candidateId, actorId: actor.actorId, sessionBindingHash: createHash("sha256").update(actor.sessionId).digest("hex"), now: this.now().toISOString() });
    if (!candidate) throw new Error("CONNECTED_SOURCE_FOLDER_CANDIDATE_INVALID");
    return this.sources.save({ ...source, providerRootReference: candidate.providerRootReference, rootDisplayName: candidate.safeDisplayName, rootConfirmedBy: actor.actorId, rootConfirmedAt: this.now().toISOString(), rootBoundaryVersion: source.rootBoundaryVersion + 1, health: "READY", lastAttemptedSyncAt: undefined, lastSuccessfulSyncAt: undefined, committedDocumentCount: 0, reviewRequiredCount: 0 }, source.revision);
  }

  async sync(actor: ProductActor, input: { connectedSourceId: string; csrfToken: string; syncIntentId: string }): Promise<SyncIntentOutcome> {
    authorizeMutation(actor, { organizationId: actor.organizationId, csrfToken: input.csrfToken });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.syncIntentId)) throw new Error("CONNECTED_SOURCE_SYNC_INTENT_INVALID");
    await this.#require(actor.organizationId, input.connectedSourceId);
    const sessionBindingHash = createHash("sha256").update(actor.sessionId).digest("hex");
    const claimed = await this.intents.claim({ organizationId: actor.organizationId, connectedSourceId: input.connectedSourceId, syncIntentId: input.syncIntentId, actorId: actor.actorId, sessionBindingHash, executionId: randomUUID(), status: "RUNNING" });
    if (!claimed.created) {
      if (claimed.record.connectedSourceId !== input.connectedSourceId || claimed.record.actorId !== actor.actorId || claimed.record.sessionBindingHash !== sessionBindingHash) throw new Error("CONNECTED_SOURCE_SYNC_INTENT_BINDING_MISMATCH");
      return { status: claimed.record.status, executionId: claimed.record.executionId, summary: claimed.record.summary, failureCode: claimed.record.failureCode, replay: true };
    }
    try {
      const summary = await this.#execute(actor, input.connectedSourceId, claimed.record.executionId);
      await this.intents.complete({ organizationId: actor.organizationId, connectedSourceId: input.connectedSourceId, syncIntentId: input.syncIntentId, status: "SUCCEEDED", summary });
      return { status: "SUCCEEDED", executionId: claimed.record.executionId, summary, replay: false };
    } catch (error) {
      const failureCode = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "CONNECTED_SOURCE_SYNC_FAILED";
      const failed = await this.intents.complete({ organizationId: actor.organizationId, connectedSourceId: input.connectedSourceId, syncIntentId: input.syncIntentId, status: "FAILED", failureCode });
      return { status: "FAILED", executionId: failed.executionId, failureCode, replay: false };
    }
  }

  async executeQueued(input: { organizationId: string; connectedSourceId: string; actorId: string; executionId: string }): Promise<ConnectedSourceSyncSummary> {
    return this.#execute({ organizationId: input.organizationId, actorId: input.actorId, sessionId: "worker", csrfToken: "worker" }, input.connectedSourceId, input.executionId);
  }

  async disconnect(actor: ProductActor, input: { connectedSourceId: string; csrfToken: string }): Promise<ConnectedSourceRecord> {
    authorizeMutation(actor, { organizationId: actor.organizationId, csrfToken: input.csrfToken });
    const source = await this.#require(actor.organizationId, input.connectedSourceId);
    return this.sources.save({ ...source, health: "DISCONNECTED", providerRootReference: undefined, rootDisplayName: undefined, rootConfirmedBy: undefined, rootConfirmedAt: undefined, rootBoundaryVersion: source.rootBoundaryVersion + 1 }, source.revision);
  }

  productView(source: ConnectedSourceRecord): Omit<ConnectedSourceRecord, "providerRootReference"> { const { providerRootReference: _, ...safe } = source; void _; return safe; }
  async #require(organizationId: string, id: string): Promise<ConnectedSourceRecord> { const source = await this.sources.find(organizationId, id); if (!source) throw new Error("CONNECTED_SOURCE_NOT_FOUND"); return source; }
  async #execute(actor: ProductActor, id: string, executionId: string): Promise<ConnectedSourceSyncSummary> {
    let source = await this.#require(actor.organizationId, id);
    if (!source.providerRootReference || source.health === "DISCONNECTED") throw new Error("CONNECTED_SOURCE_NOT_READY");
    const providerRootReference = source.providerRootReference;
    source = await this.sources.save({ ...source, health: "SYNCING", lastAttemptedSyncAt: this.now().toISOString() }, source.revision);
    try {
      const result = await this.syncEngine.execute({ organizationId: source.organizationId, connectionId: source.providerConnectionId, providerRootReference, rootBoundaryVersion: source.rootBoundaryVersion, actorId: actor.actorId, executionId });
      await this.sources.save({ ...source, health: result.reviewRequired ? "REVIEW_REQUIRED" : "UP_TO_DATE", lastSuccessfulSyncAt: this.now().toISOString(), committedDocumentCount: result.documentsAnalyzed, reviewRequiredCount: result.reviewRequired }, source.revision);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "PILOT_TERMINAL_STATE_RECONCILIATION_REQUIRED") throw error;
      await this.sources.save({ ...source, health: "ERROR" }, source.revision); throw error;
    }
  }
}

export interface GooglePickerBootstrap {
  readonly apiKey: string;
  readonly appId: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly view: { readonly id: "FOLDERS"; readonly includeFolders: true; readonly selectFolderEnabled: true; readonly enableSharedDrives: false };
}
export function createGooglePickerBootstrap(input: { apiKey: string; appId: string; accessToken: string; accessTokenExpiresAt: string }): GooglePickerBootstrap {
  if (!input.apiKey || !input.appId || !input.accessToken || new Date(input.accessTokenExpiresAt).getTime() <= Date.now()) throw new Error("GOOGLE_PICKER_BOOTSTRAP_INVALID");
  return { ...input, view: { id: "FOLDERS", includeFolders: true, selectFolderEnabled: true, enableSharedDrives: false } };
}
