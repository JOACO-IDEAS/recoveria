import type { StructuredDocumentUnderstanding } from "./types";

export type CorpusDocumentType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "UNKNOWN_DOCUMENT";

export function classifyCorpusDocument(understanding?: StructuredDocumentUnderstanding): CorpusDocumentType {
  const value = understanding?.documentType.normalized?.toUpperCase() ?? "";
  if (value.includes("NOTA") && (value.includes("CRÉDITO") || value.includes("CREDITO"))) return "CREDIT_NOTE";
  if (value.includes("NOTA") && (value.includes("DÉBITO") || value.includes("DEBITO"))) return "DEBIT_NOTE";
  if (value.includes("FACTURA")) return "INVOICE";
  return "UNKNOWN_DOCUMENT";
}

