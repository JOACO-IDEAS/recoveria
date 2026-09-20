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

export function stableSourceDocumentId(sourceType: DocumentSourceType, sourceId: string, locator: string): string {
  return `source-${createHash("sha256").update(`${sourceType}\0${sourceId}\0${locator}`).digest("hex").slice(0, 24)}`;
}

