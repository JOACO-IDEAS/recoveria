import type { DiscoveredDocument, IncrementalDocumentSource, SourceCursor } from "./document-source";

export interface DriveFileDescriptor {
  readonly fileId: string;
  readonly displayName: string;
  readonly locator: string;
  readonly mimeType: string;
  readonly size: number;
  readonly modifiedAt?: string;
}

export interface DriveFilePage {
  readonly files: readonly DriveFileDescriptor[];
  /** Opaque token; absent on the final page. */
  readonly nextPageToken?: string;
}

export class DriveSourceFetchError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) { super(code); }
}

/**
 * Offline port for a future Google Drive adapter. It deliberately contains no
 * SDK, OAuth, credential, HTTP, or provider-specific implementation.
 */
export interface GoogleDriveSourceContract extends IncrementalDocumentSource {
  readonly sourceType: "GOOGLE_DRIVE";
  listPage(pageToken?: string): Promise<DriveFilePage>;
  readFileContent(fileId: string): Promise<Uint8Array>;
  toDiscoveredDocument(file: DriveFileDescriptor): DiscoveredDocument;
  currentCursor(): Promise<SourceCursor>;
}
