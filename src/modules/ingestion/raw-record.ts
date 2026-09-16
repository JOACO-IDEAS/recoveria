import type { SourceEvidence, StructuredDocumentUnderstanding } from "./types";

export interface RawInvoiceRecord {
  readonly values: Readonly<Record<string, string>>;
  readonly evidence: Readonly<Record<string, SourceEvidence>>;
  readonly understanding?: StructuredDocumentUnderstanding;
}

export interface ParserAdapter {
  parse(documentId: string, bytes: Uint8Array): Promise<readonly RawInvoiceRecord[]>;
}
