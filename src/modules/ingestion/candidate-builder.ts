import { normalizeCuit, normalizeDate, normalizeName, parseArgentineAmount } from "./normalization";
import type { RawInvoiceRecord } from "./raw-record";
import type { EntityCandidateSignal, ExtractedField, InvoiceCandidate, SourceEvidence } from "./types";

export interface EntityCatalogEntry { readonly id: string; readonly aliases: readonly string[] }

const emptyEvidence: readonly SourceEvidence[] = [];

function textField(record: RawInvoiceRecord, key: string, normalize: (raw: string) => string = (raw) => raw.trim()): ExtractedField {
  const raw = record.values[key]?.trim() ?? "";
  const source = record.evidence[key] ? [record.evidence[key]] : emptyEvidence;
  if (!raw) return { raw: null, normalized: null, status: "MISSING", evidence: source, issues: [`MISSING_${key.toUpperCase()}`] };
  if (raw.includes("|")) return { raw, normalized: null, status: "AMBIGUOUS", evidence: source, issues: [`CONFLICTING_${key.toUpperCase()}`] };
  return { raw, normalized: normalize(raw), status: "EXTRACTED", evidence: source, issues: [] };
}

function parsedField<T>(record: RawInvoiceRecord, key: string, parser: (raw: string) => T | null): ExtractedField<T> {
  const raw = record.values[key]?.trim() ?? "";
  const source = record.evidence[key] ? [record.evidence[key]] : emptyEvidence;
  if (!raw) return { raw: null, normalized: null, status: "MISSING", evidence: source, issues: [`MISSING_${key.toUpperCase()}`] };
  if (raw.includes("|")) return { raw, normalized: null, status: "AMBIGUOUS", evidence: source, issues: [`CONFLICTING_${key.toUpperCase()}`] };
  const parsed = parser(raw);
  return parsed === null
    ? { raw, normalized: null, status: "UNCERTAIN", evidence: source, issues: [`INVALID_${key.toUpperCase()}`] }
    : { raw, normalized: parsed, status: "EXTRACTED", evidence: source, issues: [] };
}

function entitySignal(field: ExtractedField, catalog: readonly EntityCatalogEntry[]): EntityCandidateSignal {
  if (!field.raw || !field.normalized) return { raw: field.raw ?? "", normalized: "", candidateIds: [], status: "MISSING", confirmedEntityId: null, evidenceReferences: field.evidence };
  const normalized = String(field.normalized);
  const candidateIds = catalog.filter(({ aliases }) => aliases.some((alias) => normalizeName(alias) === normalized)).map(({ id }) => id);
  return {
    raw: field.raw, normalized, candidateIds,
    status: candidateIds.length === 0 ? "NO_MATCH" : candidateIds.length === 1 ? "CANDIDATE" : "AMBIGUOUS",
    confirmedEntityId: null,
    evidenceReferences: field.evidence,
  };
}

export function buildInvoiceCandidate(documentId: string, candidateIndex: number, record: RawInvoiceRecord, catalog: readonly EntityCatalogEntry[]): InvoiceCandidate {
  const invoiceNumber = textField(record, "invoiceNumber", (raw) => raw.trim().toUpperCase());
  const invoiceDate = parsedField(record, "invoiceDate", normalizeDate);
  const dueDate = parsedField(record, "dueDate", normalizeDate);
  const amountCents = parsedField(record, "amount", parseArgentineAmount);
  const currency = textField(record, "currency", (raw) => raw.toUpperCase());
  const issuer = textField(record, "issuer", normalizeName);
  const billedParty = textField(record, "billedParty", normalizeName);
  const cuit = parsedField(record, "cuit", normalizeCuit);
  const administration = textField(record, "administration", normalizeName);
  const building = textField(record, "building", normalizeName);
  const address = textField(record, "address");
  const description = textField(record, "description");
  const administrationSignal = entitySignal(administration, catalog);
  const reviewReasons = new Set<string>();
  if (invoiceNumber.status !== "EXTRACTED") reviewReasons.add("INVOICE_NUMBER_REQUIRES_REVIEW");
  if (amountCents.status !== "EXTRACTED") reviewReasons.add("AMOUNT_REQUIRES_REVIEW");
  if (invoiceDate.status !== "EXTRACTED") reviewReasons.add("INVOICE_DATE_REQUIRES_REVIEW");
  if (dueDate.status !== "EXTRACTED") reviewReasons.add("DUE_DATE_REQUIRES_REVIEW");
  if (currency.status !== "EXTRACTED") reviewReasons.add("CURRENCY_REQUIRES_REVIEW");
  if (administration.raw && administrationSignal.status !== "CANDIDATE") reviewReasons.add("ADMINISTRATION_REQUIRES_REVIEW");
  if (!administration.raw) reviewReasons.add("ADMINISTRATION_MISSING");
  return { documentId, candidateIndex, invoiceNumber, invoiceDate, dueDate, amountCents, currency, issuer, billedParty, cuit, administration, building, address, description, administrationSignal, reviewReasons: [...reviewReasons] };
}
