import { normalizeName } from "./normalization";
import type {
  DocumentRelationshipProposal,
  DocumentRelationshipReport,
  ObservedCandidate,
  SourceEvidence,
  StructuredDocumentUnderstanding,
  UnmatchedRelationshipSignal,
} from "./types";

// Phase 4.6B.1 — pure, deterministic cross-document relationship engine.
//
// This is the missing link identified by auditing Phase 4.6B: every field
// (customerTaxId, installmentStage, quotationReference, ...) was already
// extracted PER DOCUMENT with evidence and confidence, but nothing compared
// documents to each other. DuplicateDetector only ever flags exact/business
// duplicates — it does not (and must not) propose semantic relationships.
// This engine adds that missing cohort-level layer without touching
// DuplicateDetector, without merging documents, and without ever upgrading
// a proposal to a fact. Every output stays reviewable.
//
// Deliberate abstention: a bare customer-name match, with no tax id and no
// address corroboration, never produces a POSSIBLE_SAME_CUSTOMER proposal on
// its own — the real cohort showed the displayed customer phrase is generic
// across documents, so name-only similarity is evidence of nothing by
// itself (see docs/RECOVERIA-PHASE-4-6B-1-REAL-INVOICE-INTELLIGENCE.md).

export interface CohortDocument {
  readonly documentId: string;
  readonly understanding: StructuredDocumentUnderstanding;
}

const evidenceFor = (documentId: string, field: ObservedCandidate<unknown>, understanding: StructuredDocumentUnderstanding): readonly SourceEvidence[] => {
  if (!field.raw) return [];
  const observation = understanding.observations.find((item) => field.observationIds.includes(item.id));
  return [{
    documentId,
    location: { kind: "PDF_TEXT", page: observation?.page ?? 1, textSpan: field.observationIds.join(","), region: observation?.region, extractionMethod: observation?.extractionMethod, parserVersion: observation?.parserVersion },
    rawValue: field.raw,
  }];
};

const stageOf = (raw: string | null): { kind: "INSTALLMENT"; ordinal: number; total: number } | { kind: "ADVANCE" } | { kind: "BALANCE" } | undefined => {
  if (!raw) return undefined;
  const installment = raw.match(/CUOTA\s+(\d+)\s+DE\s+(\d+)/i);
  if (installment) return { kind: "INSTALLMENT", ordinal: Number(installment[1]), total: Number(installment[2]) };
  if (/ANTICIPO/i.test(raw)) return { kind: "ADVANCE" };
  if (/SALDO/i.test(raw)) return { kind: "BALANCE" };
  return undefined;
};

const wordOverlap = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return false;
  const words = (value: string) => new Set(normalizeName(value).split(" ").filter((w) => w.length > 3));
  const setA = words(a), setB = words(b);
  if (!setA.size || !setB.size) return false;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;
  return shared >= Math.min(2, Math.min(setA.size, setB.size));
};

const daysBetween = (a: string | null, b: string | null): number | undefined => {
  if (!a || !b) return undefined;
  const diff = Math.abs(Date.parse(a) - Date.parse(b));
  return Number.isFinite(diff) ? Math.round(diff / 86_400_000) : undefined;
};

interface CustomerMatch { readonly support: "TAX_ID" | "ADDRESS"; readonly confidence: "HIGH" | "MEDIUM"; readonly signal: string }

function matchCustomer(a: StructuredDocumentUnderstanding, b: StructuredDocumentUnderstanding): { match?: CustomerMatch; contradiction?: string } {
  const taxA = a.customerTaxId.normalized, taxB = b.customerTaxId.normalized;
  if (taxA && taxB) {
    if (taxA === taxB) return { match: { support: "TAX_ID", confidence: "HIGH", signal: "same normalized customer tax id" } };
    return { contradiction: "different customer tax id" };
  }
  const addressA = a.customerAddress.normalized, addressB = b.customerAddress.normalized;
  if (addressA && addressB && normalizeName(addressA) === normalizeName(addressB)) {
    return { match: { support: "ADDRESS", confidence: "MEDIUM", signal: "same normalized customer address" } };
  }
  return {};
}

function issueDateOf(u: StructuredDocumentUnderstanding): string | null {
  return u.dates.find(({ semantic }) => semantic === "ISSUE_DATE")?.normalized ?? null;
}

export function proposeDocumentRelationships(documents: readonly CohortDocument[], candidatePairs?: readonly (readonly [number, number])[]): DocumentRelationshipReport {
  const proposals: DocumentRelationshipProposal[] = [];
  const matchedForSignal = new Set<string>();

  const pairs = candidatePairs ?? documents.flatMap((_, i) => documents.slice(i + 1).map((__, offset) => [i, i + offset + 1] as const));
  for (const [i, j] of pairs) {
      const left = documents[i]!, right = documents[j]!;
      const a = left.understanding, b = right.understanding;
      const customer = matchCustomer(a, b);

      if (customer.contradiction) {
        // Same displayed name/series but a hard identity contradiction:
        // this pair must be visibly flagged as "must not merge", never dropped silently.
        const nameA = a.customerName.normalized, nameB = b.customerName.normalized;
        if (nameA && nameB && normalizeName(nameA) === normalizeName(nameB)) {
          proposals.push({
            kind: "POSSIBLE_SAME_CUSTOMER", status: "CONTRADICTED", confidence: "MEDIUM", classification: "INFERENCE",
            documentIds: [left.documentId, right.documentId],
            supportingSignals: ["same displayed customer name"],
            contradictingSignals: [customer.contradiction],
            reviewRequired: true,
            evidence: [...evidenceFor(left.documentId, a.customerTaxId, a), ...evidenceFor(right.documentId, b.customerTaxId, b)],
          });
        }
        continue; // a hard identity contradiction blocks every other same-customer-dependent proposal for this pair
      }

      if (customer.match) {
        const baseEvidence = [...evidenceFor(left.documentId, customer.match.support === "TAX_ID" ? a.customerTaxId : a.customerAddress, a), ...evidenceFor(right.documentId, customer.match.support === "TAX_ID" ? b.customerTaxId : b.customerAddress, b)];
        proposals.push({
          kind: "POSSIBLE_SAME_CUSTOMER", status: "PROPOSED", confidence: customer.match.confidence, classification: "INFERENCE",
          documentIds: [left.documentId, right.documentId], supportingSignals: [customer.match.signal],
          contradictingSignals: [], reviewRequired: customer.match.confidence !== "HIGH", evidence: baseEvidence,
        });

        // Same point-of-sale series with distinct sequential-looking numbers.
        if (a.pointOfSale.normalized && a.pointOfSale.normalized === b.pointOfSale.normalized && a.invoiceNumber.normalized !== b.invoiceNumber.normalized) {
          proposals.push({
            kind: "POSSIBLE_SAME_SERIES", status: "PROPOSED", confidence: "MEDIUM", classification: "INFERENCE",
            documentIds: [left.documentId, right.documentId], supportingSignals: ["same normalized point-of-sale series", customer.match.signal],
            contradictingSignals: [], reviewRequired: true,
            evidence: [...evidenceFor(left.documentId, a.pointOfSale, a), ...evidenceFor(right.documentId, b.pointOfSale, b)],
          });
        }

        // Recurring service: same customer, overlapping description keywords, roughly a month apart.
        const gapDays = daysBetween(issueDateOf(a), issueDateOf(b));
        if (wordOverlap(a.description.normalized, b.description.normalized) && gapDays !== undefined && gapDays >= 20 && gapDays <= 40) {
          proposals.push({
            kind: "POSSIBLE_RECURRING_SERVICE", status: "PROPOSED", confidence: "MEDIUM", classification: "INFERENCE",
            documentIds: [left.documentId, right.documentId],
            supportingSignals: [customer.match.signal, "overlapping service description", `issue dates ${gapDays} days apart`],
            contradictingSignals: [], reviewRequired: true,
            evidence: [...evidenceFor(left.documentId, a.description, a), ...evidenceFor(right.documentId, b.description, b)],
          });
        }

        // Quotation/project grouping: explicit shared quotation reference.
        const quoteA = a.quotationReference.normalized, quoteB = b.quotationReference.normalized;
        if (quoteA && quoteB && normalizeName(quoteA) === normalizeName(quoteB)) {
          matchedForSignal.add(left.documentId); matchedForSignal.add(right.documentId);
          proposals.push({
            kind: "POSSIBLE_PROJECT_GROUP", status: "PROPOSED", confidence: "MEDIUM", classification: "INFERENCE",
            documentIds: [left.documentId, right.documentId], supportingSignals: [customer.match.signal, "same quotation reference"],
            contradictingSignals: [], reviewRequired: true,
            evidence: [...evidenceFor(left.documentId, a.quotationReference, a), ...evidenceFor(right.documentId, b.quotationReference, b)],
          });
        }

        // Installment / advance-balance stage relationships.
        const stageA = stageOf(a.installmentStage.normalized), stageB = stageOf(b.installmentStage.normalized);
        if (stageA?.kind === "INSTALLMENT" && stageB?.kind === "INSTALLMENT" && stageA.total === stageB.total && stageA.ordinal !== stageB.ordinal) {
          matchedForSignal.add(left.documentId); matchedForSignal.add(right.documentId);
          proposals.push({
            kind: "POSSIBLE_INSTALLMENT_OF", status: "PROPOSED", confidence: "MEDIUM", classification: "INFERENCE",
            documentIds: [left.documentId, right.documentId],
            supportingSignals: [customer.match.signal, `installment ${stageA.ordinal}/${stageA.total} and ${stageB.ordinal}/${stageB.total}`],
            contradictingSignals: [], reviewRequired: true,
            evidence: [...evidenceFor(left.documentId, a.installmentStage, a), ...evidenceFor(right.documentId, b.installmentStage, b)],
          });
        } else if (stageA?.kind === "ADVANCE" && stageB?.kind === "BALANCE") {
          matchedForSignal.add(left.documentId); matchedForSignal.add(right.documentId);
          proposals.push({
            kind: "POSSIBLE_ADVANCE_FOR", status: "PROPOSED", confidence: "MEDIUM", classification: "INFERENCE",
            documentIds: [left.documentId, right.documentId], supportingSignals: [customer.match.signal, "advance and balance stage wording"],
            contradictingSignals: [], reviewRequired: true,
            evidence: [...evidenceFor(left.documentId, a.installmentStage, a), ...evidenceFor(right.documentId, b.installmentStage, b)],
          });
        } else if (stageA?.kind === "BALANCE" && stageB?.kind === "ADVANCE") {
          matchedForSignal.add(left.documentId); matchedForSignal.add(right.documentId);
          proposals.push({
            kind: "POSSIBLE_BALANCE_FOR", status: "PROPOSED", confidence: "MEDIUM", classification: "INFERENCE",
            documentIds: [left.documentId, right.documentId], supportingSignals: [customer.match.signal, "balance and advance stage wording"],
            contradictingSignals: [], reviewRequired: true,
            evidence: [...evidenceFor(left.documentId, a.installmentStage, a), ...evidenceFor(right.documentId, b.installmentStage, b)],
          });
        }
      }
  }

  // Any document that raises an installment/advance/balance/quotation signal
  // but never found a qualifying sibling stays an explicit, reviewable gap —
  // never silently assumed complete and never fabricated as a duplicate.
  const unmatchedSignals: UnmatchedRelationshipSignal[] = [];
  for (const { documentId, understanding } of documents) {
    if (matchedForSignal.has(documentId)) continue;
    const stage = stageOf(understanding.installmentStage.normalized);
    if (stage?.kind === "INSTALLMENT") {
      unmatchedSignals.push({
        documentId, signalKind: "POSSIBLE_INSTALLMENT_OF",
        reason: `Document indicates installment ${stage.ordinal} of ${stage.total}, but no matching counterpart was found in this cohort.`,
        evidence: evidenceFor(documentId, understanding.installmentStage, understanding),
      });
    } else if (stage?.kind === "ADVANCE") {
      unmatchedSignals.push({ documentId, signalKind: "POSSIBLE_ADVANCE_FOR", reason: "Document indicates an advance payment, but no matching balance document was found in this cohort.", evidence: evidenceFor(documentId, understanding.installmentStage, understanding) });
    } else if (stage?.kind === "BALANCE") {
      unmatchedSignals.push({ documentId, signalKind: "POSSIBLE_BALANCE_FOR", reason: "Document indicates a balance payment, but no matching advance document was found in this cohort.", evidence: evidenceFor(documentId, understanding.installmentStage, understanding) });
    } else if (understanding.quotationReference.normalized) {
      unmatchedSignals.push({ documentId, signalKind: "POSSIBLE_PROJECT_GROUP", reason: "Document references a quotation, but no other document in this cohort shares it.", evidence: evidenceFor(documentId, understanding.quotationReference, understanding) });
    }
  }

  return { proposals, unmatchedSignals };
}
