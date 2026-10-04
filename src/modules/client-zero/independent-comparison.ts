import type { DocumentProposal, FieldProposal, ReviewableFieldName } from "./ground-truth-types";
import type { IndependentDocumentVerification, IndependentFieldObservation, VerificationFieldName } from "./independent-verification-types";

export const COMPARABLE_VERIFICATION_FIELDS = ["invoiceNumber", "issueDate", "documentedDueDate", "nominalAmount", "currency", "issuer", "billedCustomer", "administration", "building"] as const satisfies readonly VerificationFieldName[];
export type ComparableVerificationField = (typeof COMPARABLE_VERIFICATION_FIELDS)[number];
export type ComparisonStatus = "AUTO_VERIFIED_MATCH" | "AUTO_VERIFIED_ABSENT" | "DISAGREEMENT" | "AMBIGUOUS" | "HUMAN_REVIEW";

const PROPOSAL_FIELD: Readonly<Record<ComparableVerificationField, ReviewableFieldName>> = {
  invoiceNumber: "invoiceNumber", issueDate: "invoiceDate", documentedDueDate: "dueDate", nominalAmount: "amountCents", currency: "currency", issuer: "issuer", billedCustomer: "billedParty", administration: "administration", building: "building",
};
const IDENTITY_FIELDS = new Set<ComparableVerificationField>(["issuer", "billedCustomer", "administration", "building"]);

export interface FieldComparison { readonly field: ComparableVerificationField; readonly proposalField: ReviewableFieldName; readonly status: ComparisonStatus; readonly proposalPresent: boolean; readonly observationStatus: IndependentFieldObservation["status"] }
export interface DocumentComparison { readonly documentId: string; readonly fields: Readonly<Record<ComparableVerificationField, FieldComparison>> }
export interface AgreementCounts { readonly comparable: number; readonly matches: number; readonly absentAgreement: number; readonly disagreements: number; readonly ambiguous: number; readonly humanReviewRequired: number }
export interface ComparisonArtifact { readonly schemaVersion: 1; readonly comparisonContractVersion: "phase-8b2a-v1"; readonly documents: readonly DocumentComparison[]; readonly agreementByField: Readonly<Record<ComparableVerificationField, AgreementCounts>>; readonly totals: AgreementCounts & { readonly totalReviewableFields: number; readonly autoVerifiable: number; readonly humanRequired: number; readonly estimatedManualWorkReduction: number }; readonly servicePeriod: { readonly found: number; readonly notFound: number; readonly ambiguous: number } }

function fold(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function normalizeDate(value: string): string | null { const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (iso) return value; const match = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/.exec(value); if (!match) return null; const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!; return `${year}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`; }
function normalizeMoney(value: string): string | null { const cleaned = value.replace(/[^0-9.,]/g, ""); if (!cleaned) return null; const comma = cleaned.lastIndexOf(","), dot = cleaned.lastIndexOf("."); let integer = cleaned, decimal = ""; if (comma > dot && cleaned.length - comma === 3) { integer = cleaned.slice(0, comma); decimal = cleaned.slice(comma + 1); } else if (dot > comma && cleaned.length - dot === 3) { integer = cleaned.slice(0, dot); decimal = cleaned.slice(dot + 1); } integer = integer.replace(/[.,]/g, ""); if (!/^\d+$/.test(integer)) return null; return `${BigInt(integer)}.${decimal || "00"}`; }
function normalizeCurrency(value: string): string | null { const normalized = fold(value); return /\b(ars|peso|pesos|peso argentino|pesos argentinos)\b/.test(normalized) ? "ARS" : null; }
function proposalText(proposal: FieldProposal): string | null { if (proposal.raw !== null && proposal.raw.trim() !== "") return proposal.raw; return typeof proposal.normalized === "string" || typeof proposal.normalized === "number" ? String(proposal.normalized) : null; }
function normalizedProposal(field: ComparableVerificationField, proposal: FieldProposal): string | null { const value = proposalText(proposal); if (value === null) return null; if (field === "issueDate" || field === "documentedDueDate") return normalizeDate(value); if (field === "nominalAmount") return normalizeMoney(value); if (field === "currency") return normalizeCurrency(value); return fold(value); }

export function compareField(field: ComparableVerificationField, proposal: FieldProposal, observation: IndependentFieldObservation): FieldComparison {
  const proposalValue = normalizedProposal(field, proposal); const proposalPresent = proposalText(proposal) !== null;
  let status: ComparisonStatus;
  if (observation.status === "AMBIGUOUS") status = "AMBIGUOUS";
  else if (observation.status === "NOT_FOUND") status = proposalPresent ? "DISAGREEMENT" : "AUTO_VERIFIED_ABSENT";
  else if (!proposalPresent || !proposalValue || !observation.normalizedValue) status = "DISAGREEMENT";
  else {
    const matches = proposalValue === (field === "invoiceNumber" ? fold(observation.normalizedValue) : observation.normalizedValue);
    if (!matches) status = "DISAGREEMENT";
    else if (IDENTITY_FIELDS.has(field) && observation.confidence !== "HIGH") status = "HUMAN_REVIEW";
    else status = "AUTO_VERIFIED_MATCH";
  }
  return { field, proposalField: PROPOSAL_FIELD[field], status, proposalPresent, observationStatus: observation.status };
}

function emptyCounts(): AgreementCounts { return { comparable: 0, matches: 0, absentAgreement: 0, disagreements: 0, ambiguous: 0, humanReviewRequired: 0 }; }
function add(counts: AgreementCounts, status: ComparisonStatus): AgreementCounts { return { comparable: counts.comparable + 1, matches: counts.matches + Number(status === "AUTO_VERIFIED_MATCH"), absentAgreement: counts.absentAgreement + Number(status === "AUTO_VERIFIED_ABSENT"), disagreements: counts.disagreements + Number(status === "DISAGREEMENT"), ambiguous: counts.ambiguous + Number(status === "AMBIGUOUS"), humanReviewRequired: counts.humanReviewRequired + Number(status === "HUMAN_REVIEW") }; }

export function compareIndependentVerification(proposals: readonly DocumentProposal[], observations: readonly IndependentDocumentVerification[]): ComparisonArtifact {
  if (proposals.length !== 20 || observations.length !== 20) throw new Error("INDEPENDENT_COMPARISON_DOCUMENT_COUNT_MISMATCH");
  const observationById = new Map(observations.map((item) => [item.documentId, item]));
  const agreementByField = Object.fromEntries(COMPARABLE_VERIFICATION_FIELDS.map((field) => [field, emptyCounts()])) as Record<ComparableVerificationField, AgreementCounts>;
  let totals = emptyCounts();
  const documents = proposals.map((proposal) => {
    const observation = observationById.get(proposal.privateSafeDocumentId); if (!observation) throw new Error("INDEPENDENT_COMPARISON_OBSERVATION_MISSING");
    const fields = Object.fromEntries(COMPARABLE_VERIFICATION_FIELDS.map((field) => { const comparison = compareField(field, proposal.fields[PROPOSAL_FIELD[field]], observation.fields[field]); agreementByField[field] = add(agreementByField[field], comparison.status); totals = add(totals, comparison.status); return [field, comparison]; })) as Record<ComparableVerificationField, FieldComparison>;
    return { documentId: proposal.privateSafeDocumentId, fields };
  });
  const autoVerifiable = totals.matches + totals.absentAgreement; const humanRequired = totals.disagreements + totals.ambiguous + totals.humanReviewRequired;
  const servicePeriod = observations.reduce((result, item) => ({ found: result.found + Number(item.fields.servicePeriod.status === "FOUND"), notFound: result.notFound + Number(item.fields.servicePeriod.status === "NOT_FOUND"), ambiguous: result.ambiguous + Number(item.fields.servicePeriod.status === "AMBIGUOUS") }), { found: 0, notFound: 0, ambiguous: 0 });
  return { schemaVersion: 1, comparisonContractVersion: "phase-8b2a-v1", documents, agreementByField, totals: { ...totals, totalReviewableFields: totals.comparable, autoVerifiable, humanRequired, estimatedManualWorkReduction: totals.comparable > 0 ? autoVerifiable / totals.comparable : 0 }, servicePeriod };
}
