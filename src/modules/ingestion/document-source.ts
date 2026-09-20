import { createHash } from "node:crypto";

export type DocumentSourceType = "LOCAL_FOLDER" | "GOOGLE_DRIVE" | "UPLOAD";

export interface SourceProvenance {
  readonly sourceType: DocumentSourceType;
  readonly sourceId: string;
  readonly sourceDocumentId: string;
  readonly locator: string;
}

export interface DiscoveredDocument {
  readonly sourceDocumentId: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly modifiedAt?: string;
  readonly supported: boolean;
  readonly provenance: SourceProvenance;
  readContent(): Promise<Uint8Array>;
}

export interface DocumentSource {
  readonly sourceType: DocumentSourceType;
  readonly sourceId: string;
  readonly organizationId: string;
  discover(): Promise<readonly DiscoveredDocument[]>;
}

export interface SourceCursor {
  readonly organizationId: string;
  readonly sourceType: DocumentSourceType;
  readonly sourceId: string;
  /** Opaque to RecoverIA and meaningful only to the owning source adapter. */
  readonly value: string;
}

export interface SourceChangeSet {
  readonly status: "VALID" | "INVALID" | "EXPIRED";
  readonly changedDocuments: readonly DiscoveredDocument[];
  readonly removedSourceDocumentIds: readonly string[];
  readonly nextCursor?: SourceCursor;
}

/** Optional capability. Full discover() remains the documentary truth boundary. */
export interface IncrementalDocumentSource extends DocumentSource {
  discoverChanges(cursor: SourceCursor): Promise<SourceChangeSet>;
  currentCursor(): Promise<SourceCursor>;
}

export function isIncrementalDocumentSource(source: DocumentSource): source is IncrementalDocumentSource {
  const candidate = source as Partial<IncrementalDocumentSource>;
  return typeof candidate.discoverChanges === "function" && typeof candidate.currentCursor === "function";
}

export function assertCursorBoundary(source: DocumentSource, cursor: SourceCursor): void {
  if (cursor.organizationId !== source.organizationId || cursor.sourceType !== source.sourceType || cursor.sourceId !== source.sourceId) {
    throw new Error("SOURCE_CURSOR_BOUNDARY_MISMATCH");
  }
}

export function stableSourceDocumentId(sourceType: DocumentSourceType, sourceId: string, locator: string): string {
  return `source-${createHash("sha256").update(`${sourceType}\0${sourceId}\0${locator}`).digest("hex").slice(0, 24)}`;
}
