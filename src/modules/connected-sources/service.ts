import { randomUUID } from "node:crypto";
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

export interface FolderCandidate { readonly candidateId: string; readonly organizationId: string; readonly connectionId: string; readonly providerRootReference: string; readonly safeDisplayName: string; readonly expiresAt: string }
export interface FolderCandidateRepository { create(candidate: FolderCandidate): Promise<void>; consume(organizationId: string, connectionId: string, candidateId: string, now: string): Promise<FolderCandidate | null> }
export class InMemoryFolderCandidateRepository implements FolderCandidateRepository {
  readonly records = new Map<string, FolderCandidate>();
  async create(candidate: FolderCandidate): Promise<void> { this.records.set(candidate.candidateId, candidate); }
  async consume(organizationId: string, connectionId: string, candidateId: string, now: string): Promise<FolderCandidate | null> { const candidate = this.records.get(candidateId); if (!candidate || candidate.organizationId !== organizationId || candidate.connectionId !== connectionId || candidate.expiresAt <= now) return null; this.records.delete(candidateId); return candidate; }
}

export interface GoogleFolderValidator { validate(input: { organizationId: string; connectionId: string; untrustedFolderId: string }): Promise<{ providerRootReference: string; safeDisplayName: string; mimeType: "application/vnd.google-apps.folder"; trashed: false; location: "MY_DRIVE" }> }
export interface ConnectedSourceSyncEngine { execute(input: { organizationId: string; connectionId: string; providerRootReference: string; rootBoundaryVersion: number; actorId: string }): Promise<ConnectedSourceSyncSummary> }

export interface ProductActor { readonly organizationId: string; readonly actorId: string; readonly sessionId: string; readonly csrfToken: string }
export function authorizeMutation(actor: ProductActor, input: { organizationId: string; csrfToken: string }): void {
  if (actor.organizationId !== input.organizationId) throw new Error("CONNECTED_SOURCE_TENANT_MISMATCH");
  if (!input.csrfToken || input.csrfToken !== actor.csrfToken) throw new Error("CONNECTED_SOURCE_CSRF_REJECTED");
}

export class ConnectedSourceService {
  readonly #active = new Map<string, Promise<ConnectedSourceSyncSummary>>();
  constructor(private readonly sources: ConnectedSourceRepository, private readonly candidates: FolderCandidateRepository, private readonly folders: GoogleFolderValidator, private readonly syncEngine: ConnectedSourceSyncEngine, private readonly now: () => Date = () => new Date()) {}

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
    await this.candidates.create({ candidateId, organizationId: actor.organizationId, connectionId: source.providerConnectionId, providerRootReference: folder.providerRootReference, safeDisplayName: folder.safeDisplayName, expiresAt: new Date(this.now().getTime() + 10 * 60_000).toISOString() });
    return { candidateId, displayName: folder.safeDisplayName };
  }

  async confirmFolder(actor: ProductActor, input: { connectedSourceId: string; candidateId: string; csrfToken: string }): Promise<ConnectedSourceRecord> {
    authorizeMutation(actor, { organizationId: actor.organizationId, csrfToken: input.csrfToken });
    const source = await this.#require(actor.organizationId, input.connectedSourceId);
    const candidate = await this.candidates.consume(actor.organizationId, source.providerConnectionId, input.candidateId, this.now().toISOString());
    if (!candidate) throw new Error("CONNECTED_SOURCE_FOLDER_CANDIDATE_INVALID");
    return this.sources.save({ ...source, providerRootReference: candidate.providerRootReference, rootDisplayName: candidate.safeDisplayName, rootConfirmedBy: actor.actorId, rootConfirmedAt: this.now().toISOString(), rootBoundaryVersion: source.rootBoundaryVersion + 1, health: "READY", lastAttemptedSyncAt: undefined, lastSuccessfulSyncAt: undefined, committedDocumentCount: 0, reviewRequiredCount: 0 }, source.revision);
  }

  async sync(actor: ProductActor, input: { connectedSourceId: string; csrfToken: string }): Promise<ConnectedSourceSyncSummary> {
    authorizeMutation(actor, { organizationId: actor.organizationId, csrfToken: input.csrfToken });
    const key = `${actor.organizationId}\0${input.connectedSourceId}`;
    const active = this.#active.get(key); if (active) return active;
    const operation = this.#execute(actor, input.connectedSourceId).finally(() => this.#active.delete(key));
    this.#active.set(key, operation);
    return operation;
  }

  async disconnect(actor: ProductActor, input: { connectedSourceId: string; csrfToken: string }): Promise<ConnectedSourceRecord> {
    authorizeMutation(actor, { organizationId: actor.organizationId, csrfToken: input.csrfToken });
    const source = await this.#require(actor.organizationId, input.connectedSourceId);
    return this.sources.save({ ...source, health: "DISCONNECTED", providerRootReference: undefined, rootDisplayName: undefined, rootConfirmedBy: undefined, rootConfirmedAt: undefined, rootBoundaryVersion: source.rootBoundaryVersion + 1 }, source.revision);
  }

  productView(source: ConnectedSourceRecord): Omit<ConnectedSourceRecord, "providerRootReference"> { const { providerRootReference: _, ...safe } = source; void _; return safe; }
  async #require(organizationId: string, id: string): Promise<ConnectedSourceRecord> { const source = await this.sources.find(organizationId, id); if (!source) throw new Error("CONNECTED_SOURCE_NOT_FOUND"); return source; }
  async #execute(actor: ProductActor, id: string): Promise<ConnectedSourceSyncSummary> {
    let source = await this.#require(actor.organizationId, id);
    if (!source.providerRootReference || source.health === "DISCONNECTED") throw new Error("CONNECTED_SOURCE_NOT_READY");
    const providerRootReference = source.providerRootReference;
    source = await this.sources.save({ ...source, health: "SYNCING", lastAttemptedSyncAt: this.now().toISOString() }, source.revision);
    try {
      const result = await this.syncEngine.execute({ organizationId: source.organizationId, connectionId: source.providerConnectionId, providerRootReference, rootBoundaryVersion: source.rootBoundaryVersion, actorId: actor.actorId });
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
