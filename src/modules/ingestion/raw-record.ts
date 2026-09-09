import type { SourceEvidence } from "./types";

export interface RawInvoiceRecord {
  readonly values: Readonly<Record<string, string>>;
  readonly evidence: Readonly<Record<string, SourceEvidence>>;
}

export interface ParserAdapter {
  parse(documentId: string, bytes: Uint8Array): Promise<readonly RawInvoiceRecord[]>;
}
