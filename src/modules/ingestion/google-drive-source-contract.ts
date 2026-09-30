import { createHash } from "node:crypto";
import { assertCursorBoundary, type DiscoveredDocument, type IncrementalDocumentSource, type SourceChangeSet, type SourceCursor } from "./document-source";
import type { IncrementalCorpusReport } from "./incremental-corpus-processor";

export type DriveAuthorizationState = "DISCONNECTED" | "AUTHORIZATION_PENDING" | "CONNECTED" | "REAUTHORIZATION_REQUIRED" | "REVOKED" | "AUTHORIZED" | "PERMISSION_LOST";
export interface DriveConnection { readonly organizationId: string; readonly connectionId: string; readonly googleSubject: string; readonly authorizedRootId: string; readonly sharedDriveId?: string; readonly authorizationState: DriveAuthorizationState }
export type DriveItemKind = "FILE" | "FOLDER" | "SHORTCUT";
export interface DriveFileDescriptor { readonly fileId: string; readonly displayName: string; readonly locator: string; readonly mimeType: string; readonly size: number; readonly modifiedAt?: string; readonly providerContentIdentity?: string; readonly kind?: DriveItemKind; readonly trashed?: boolean; readonly corpusRootId?: string; readonly shortcutTargetId?: string }
export interface DriveFilePage { readonly files: readonly DriveFileDescriptor[]; readonly nextPageToken?: string }
export interface DriveChange { readonly fileId: string; readonly removed: boolean; readonly file?: DriveFileDescriptor }
export interface DriveChangePage { readonly changes: readonly DriveChange[]; readonly nextPageToken?: string; readonly newStartPageToken?: string }

export type DriveErrorKind = "RETRYABLE" | "AUTHORIZATION" | "TERMINAL" | "CURSOR_INVALID" | "CURSOR_EXPIRED";
export class DriveSourceFetchError extends Error { readonly retryable: boolean; constructor(readonly code: string, readonly kind: DriveErrorKind) { super(code); this.retryable = kind === "RETRYABLE"; } }
export function mapGoogleDriveFailure(input: { readonly status?: number; readonly reason?: string; readonly network?: "TIMEOUT" | "INTERRUPTED" }): DriveSourceFetchError {
  if (input.network) return new DriveSourceFetchError(`DRIVE_${input.network}`, "RETRYABLE");
  if (input.status === 401 || input.reason === "REVOKED_CONSENT" || input.reason === "PERMISSION_LOSS") return new DriveSourceFetchError(`DRIVE_${input.reason ?? "UNAUTHORIZED"}`, "AUTHORIZATION");
  if (input.status === 429 || (input.status === 403 && ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(input.reason ?? "")) || (input.status !== undefined && input.status >= 500)) return new DriveSourceFetchError(`DRIVE_${input.reason ?? input.status}`, "RETRYABLE");
  return new DriveSourceFetchError(`DRIVE_${input.reason ?? input.status ?? "INVALID_REQUEST"}`, "TERMINAL");
}

export interface GoogleDriveClientPort {
  listFiles(input: { readonly rootId: string; readonly sharedDriveId?: string; readonly pageToken?: string }): Promise<DriveFilePage>;
  getMetadata(fileId: string): Promise<DriveFileDescriptor>;
  readPdfContent(fileId: string): Promise<Uint8Array>;
  getStartPageToken(input: { readonly rootId: string; readonly sharedDriveId?: string }): Promise<string>;
  listChanges(input: { readonly rootId: string; readonly sharedDriveId?: string; readonly pageToken: string }): Promise<DriveChangePage>;
}

export interface GoogleDriveSourceContract extends IncrementalDocumentSource { readonly sourceType: "GOOGLE_DRIVE"; listPage(pageToken?: string): Promise<DriveFilePage>; readFileContent(fileId: string): Promise<Uint8Array>; toDiscoveredDocument(file: DriveFileDescriptor): DiscoveredDocument }
const unsupportedSentinel = (file: DriveFileDescriptor): Uint8Array => new TextEncoder().encode(`UNSUPPORTED\0${file.fileId}\0${file.mimeType}`);
export const DRIVE_MAX_PAGES = 10_000;

export class GoogleDriveSource implements GoogleDriveSourceContract {
  readonly sourceType = "GOOGLE_DRIVE" as const; readonly organizationId: string; readonly sourceId: string; readonly cursorBoundary: string;
  constructor(readonly connection: DriveConnection, private readonly client: GoogleDriveClientPort) { this.organizationId = connection.organizationId; this.sourceId = connection.connectionId; this.cursorBoundary = `drive-corpus-${createHash("sha256").update(`${connection.authorizedRootId}\0${connection.sharedDriveId ?? ""}`).digest("hex")}`; if (connection.authorizationState !== "AUTHORIZED" && connection.authorizationState !== "CONNECTED") throw new DriveSourceFetchError("DRIVE_AUTHORIZATION_INACTIVE", "AUTHORIZATION"); }
  listPage(pageToken?: string): Promise<DriveFilePage> { return this.client.listFiles({ rootId: this.connection.authorizedRootId, sharedDriveId: this.connection.sharedDriveId, pageToken }); }
  readFileContent(fileId: string): Promise<Uint8Array> { return this.client.readPdfContent(fileId); }
  #assertBoundary(file: DriveFileDescriptor): void { if (file.corpusRootId !== this.connection.authorizedRootId) throw new DriveSourceFetchError("DRIVE_CORPUS_BOUNDARY_VIOLATION", "TERMINAL"); }
  toDiscoveredDocument(file: DriveFileDescriptor): DiscoveredDocument { this.#assertBoundary(file); const supported = file.mimeType === "application/pdf" && (file.kind ?? "FILE") === "FILE"; return { sourceDocumentId: file.fileId, displayName: file.displayName, mimeType: file.mimeType, size: file.size, modifiedAt: file.modifiedAt, providerContentIdentity: file.providerContentIdentity, supported, provenance: { sourceType: this.sourceType, sourceId: this.sourceId, sourceDocumentId: file.fileId, locator: file.locator }, readContent: () => supported ? this.client.readPdfContent(file.fileId) : Promise.resolve(unsupportedSentinel(file)) }; }
  async discover(): Promise<readonly DiscoveredDocument[]> { const byId = new Map<string, DriveFileDescriptor>(); const seen = new Set<string>(); let token: string | undefined; let pages = 0; do { if (++pages > DRIVE_MAX_PAGES) throw new DriveSourceFetchError("DRIVE_PAGINATION_LIMIT_EXCEEDED", "TERMINAL"); const page = await this.listPage(token); for (const file of page.files) { this.#assertBoundary(file); const prior = byId.get(file.fileId); if (prior && JSON.stringify(prior) !== JSON.stringify(file)) throw new DriveSourceFetchError("DRIVE_PAGINATION_METADATA_CONFLICT", "TERMINAL"); if (!file.trashed && (file.kind ?? "FILE") !== "FOLDER" && !prior) byId.set(file.fileId, file); } token = page.nextPageToken; if (token) { if (seen.has(token)) throw new DriveSourceFetchError("DRIVE_PAGINATION_TOKEN_CYCLE", "TERMINAL"); seen.add(token); } } while (token); return [...byId.values()].sort((a, b) => a.fileId.localeCompare(b.fileId)).map((file) => this.toDiscoveredDocument(file)); }
  async currentCursor(): Promise<SourceCursor> { const value = await this.client.getStartPageToken({ rootId: this.connection.authorizedRootId, sharedDriveId: this.connection.sharedDriveId }); if (!value) throw new DriveSourceFetchError("DRIVE_CURSOR_MALFORMED", "CURSOR_INVALID"); return { organizationId: this.organizationId, sourceType: this.sourceType, sourceId: this.sourceId, boundary: this.cursorBoundary, value }; }
  async discoverChanges(cursor: SourceCursor): Promise<SourceChangeSet> { assertCursorBoundary(this, cursor); const changed = new Map<string, DiscoveredDocument>(); const removed = new Set<string>(); const seen = new Set<string>([cursor.value]); let token = cursor.value; let nextCursor: string | undefined; let pages = 0; try { do { if (++pages > DRIVE_MAX_PAGES) throw new DriveSourceFetchError("DRIVE_CHANGE_PAGINATION_LIMIT_EXCEEDED", "TERMINAL"); const page = await this.client.listChanges({ rootId: this.connection.authorizedRootId, sharedDriveId: this.connection.sharedDriveId, pageToken: token }); for (const change of page.changes) { if (change.removed || change.file?.trashed) { removed.add(change.fileId); changed.delete(change.fileId); continue; } if (!change.file) continue; this.#assertBoundary(change.file); changed.set(change.fileId, this.toDiscoveredDocument(change.file)); removed.delete(change.fileId); } token = page.nextPageToken ?? ""; nextCursor = page.newStartPageToken ?? nextCursor; if (token) { if (seen.has(token)) throw new DriveSourceFetchError("DRIVE_CHANGE_PAGINATION_TOKEN_CYCLE", "TERMINAL"); seen.add(token); } } while (token); } catch (error) { if (error instanceof DriveSourceFetchError && (error.kind === "CURSOR_INVALID" || error.kind === "CURSOR_EXPIRED")) return { status: error.kind === "CURSOR_EXPIRED" ? "EXPIRED" : "INVALID", changedDocuments: [], removedSourceDocumentIds: [] }; throw error; } return { status: "VALID", changedDocuments: [...changed.values()].sort((a, b) => a.sourceDocumentId.localeCompare(b.sourceDocumentId)), removedSourceDocumentIds: [...removed].sort(), ...(nextCursor ? { nextCursor: { organizationId: this.organizationId, sourceType: this.sourceType, sourceId: this.sourceId, boundary: this.cursorBoundary, value: nextCursor } } : {}) }; }
}

export interface SanitizedDriveCorpusReport { readonly processingStatus: "COMPLETE" | "PARTIAL" | "FAILED"; readonly filesDiscovered: number; readonly newFiles: number; readonly changedFiles: number; readonly reusedFiles: number; readonly understoodFiles: number; readonly unsupportedFiles: number; readonly failedFiles: number; readonly invoicesUnderstood: number; readonly reviewRequired: number; readonly contradictions: number }
export function toSanitizedDriveCorpusReport(report: IncrementalCorpusReport): SanitizedDriveCorpusReport {
  return { processingStatus: report.failures.length === 0 ? "COMPLETE" : report.documents.length ? "PARTIAL" : "FAILED", filesDiscovered: report.metrics.documentsDiscovered,
    newFiles: report.changes.filter(({ kind }) => kind === "NEW" || kind === "SAME_CONTENT_DIFFERENT_SOURCE_RECORD").length,
    changedFiles: report.changes.filter(({ kind }) => kind === "CONTENT_CHANGED" || kind === "PROCESSING_VERSION_CHANGED").length,
    reusedFiles: report.metrics.documentsReused, understoodFiles: report.metrics.documentsUnderstood, unsupportedFiles: report.summary.documentsUnsupported, failedFiles: report.metrics.documentsFailed,
    invoicesUnderstood: report.summary.documentsClassifiedAsInvoice, reviewRequired: report.summary.reviewRequiredItems, contradictions: report.summary.contradictions };
}
