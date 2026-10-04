import { IDENTITY_FIELD_NAMES, REVIEWABLE_FIELD_NAMES, type DocumentProposal, type GroundTruthStore, type ReviewableFieldName } from "./ground-truth-types";

// Phase 8B.2: evaluates pipeline proposals against founder-supplied ground
// truth. Pure functions -- no I/O, no DB access, fully testable with
// synthetic fixtures. Never runs until ground truth exists; with zero
// reviewed fields every count below is correctly zero/null, never fabricated.

export interface FieldEvaluation {
  readonly reviewed: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly notPresent: number;
  readonly uncertain: number;
  /** correct / (correct + incorrect); null when that denominator is 0 -- "only when mathematically justified." */
  readonly accuracyOverReviewedApplicable: number | null;
  /** Pipeline proposed a non-empty value; founder confirmed the field does not appear in the document at all. */
  readonly falseExtractionWhenAbsent: number;
  /** Pipeline proposed no value (or empty); founder says the field is present and supplied a corrected value. */
  readonly missedExtractionWhenPresent: number;
  /** Fraction of all proposals (regardless of review state) that carry at least one provenance reference. */
  readonly provenanceCoverage: number;
}

function proposedPresent(raw: string | null): boolean {
  return raw !== null && raw !== "";
}

export function evaluateField(proposals: readonly DocumentProposal[], groundTruth: GroundTruthStore, fieldName: ReviewableFieldName): FieldEvaluation {
  let reviewed = 0, correct = 0, incorrect = 0, notPresent = 0, uncertain = 0, falseExtractionWhenAbsent = 0, missedExtractionWhenPresent = 0, provenanceCount = 0;
  for (const proposal of proposals) {
    const field = proposal.fields[fieldName];
    if (field.sourceLocation) provenanceCount += 1;
    const label = groundTruth[proposal.privateSafeDocumentId]?.fields[fieldName];
    if (!label || label.status === "UNREVIEWED") continue;
    reviewed += 1;
    switch (label.status) {
      case "CORRECT": correct += 1; break;
      case "INCORRECT": incorrect += 1; if (!proposedPresent(field.raw)) missedExtractionWhenPresent += 1; break;
      case "NOT_PRESENT_IN_DOCUMENT": notPresent += 1; if (proposedPresent(field.raw)) falseExtractionWhenAbsent += 1; break;
      case "UNCERTAIN": uncertain += 1; break;
    }
  }
  const applicable = correct + incorrect;
  return {
    reviewed, correct, incorrect, notPresent, uncertain,
    accuracyOverReviewedApplicable: applicable > 0 ? correct / applicable : null,
    falseExtractionWhenAbsent, missedExtractionWhenPresent,
    provenanceCoverage: proposals.length > 0 ? provenanceCount / proposals.length : 0,
  };
}

export interface EvaluationReport {
  readonly perField: Readonly<Record<ReviewableFieldName, FieldEvaluation>>;
  readonly perIdentityField: Readonly<Record<(typeof IDENTITY_FIELD_NAMES)[number], FieldEvaluation>>;
  readonly documentLevelPerfectExtractionRate: number | null;
  readonly documentsWithAnyReview: number;
  readonly totalDocuments: number;
}

export function evaluateAll(proposals: readonly DocumentProposal[], groundTruth: GroundTruthStore): EvaluationReport {
  const perField = Object.fromEntries(REVIEWABLE_FIELD_NAMES.map((name) => [name, evaluateField(proposals, groundTruth, name)])) as Record<ReviewableFieldName, FieldEvaluation>;
  const perIdentityField = Object.fromEntries(IDENTITY_FIELD_NAMES.map((name) => [name, perField[name]])) as Record<(typeof IDENTITY_FIELD_NAMES)[number], FieldEvaluation>;

  let documentsWithAnyReview = 0, documentsPerfect = 0;
  for (const proposal of proposals) {
    const groundTruthDocument = groundTruth[proposal.privateSafeDocumentId];
    if (!groundTruthDocument) continue;
    const reviewedStatuses = REVIEWABLE_FIELD_NAMES.map((name) => groundTruthDocument.fields[name].status).filter((status) => status !== "UNREVIEWED");
    if (reviewedStatuses.length === 0) continue;
    documentsWithAnyReview += 1;
    if (reviewedStatuses.every((status) => status === "CORRECT")) documentsPerfect += 1;
  }

  return {
    perField, perIdentityField,
    documentLevelPerfectExtractionRate: documentsWithAnyReview > 0 ? documentsPerfect / documentsWithAnyReview : null,
    documentsWithAnyReview, totalDocuments: proposals.length,
  };
}
