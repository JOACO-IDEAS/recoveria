import { describe, expect, it } from "vitest";
import { evaluateAll, evaluateField } from "./ground-truth-evaluation";
import { applyFieldLabel, initializeGroundTruth } from "./ground-truth-store";
import { REVIEWABLE_FIELD_NAMES, type DocumentProposal } from "./ground-truth-types";

const proposal = (id: string, overrides: Partial<Record<string, { raw: string | null; sourceLocation: unknown }>> = {}): DocumentProposal => ({
  documentId: `source-${id}`, privateSafeDocumentId: id, importBatchId: "batch", reviewReasons: [], pdfFileName: `${id}.pdf`,
  fields: Object.fromEntries(REVIEWABLE_FIELD_NAMES.map((name) => {
    const override = overrides[name];
    const raw = override ? override.raw : "proposed-value";
    return [name, { raw, normalized: raw, sourceLocation: override ? override.sourceLocation : { kind: "PDF_TEXT" } }];
  })) as DocumentProposal["fields"],
});

describe("ground truth evaluation", () => {
  it("reports all zero and null accuracy before any label exists", () => {
    const proposals = [proposal("doc-01"), proposal("doc-02")];
    const groundTruth = initializeGroundTruth(proposals);
    const evaluation = evaluateField(proposals, groundTruth, "invoiceNumber");
    expect(evaluation).toMatchObject({ reviewed: 0, correct: 0, incorrect: 0, notPresent: 0, uncertain: 0, accuracyOverReviewedApplicable: null });
    expect(evaluation.provenanceCoverage).toBe(1);
  });

  it("computes accuracy only over reviewed, applicable (correct+incorrect) labels", () => {
    const proposals = [proposal("doc-01"), proposal("doc-02"), proposal("doc-03")];
    let groundTruth = initializeGroundTruth(proposals);
    groundTruth = applyFieldLabel(groundTruth, { documentId: "doc-01", fieldName: "currency", status: "CORRECT", reviewer: "founder" });
    groundTruth = applyFieldLabel(groundTruth, { documentId: "doc-02", fieldName: "currency", status: "INCORRECT", correctedValue: "ARS", reviewer: "founder" });
    groundTruth = applyFieldLabel(groundTruth, { documentId: "doc-03", fieldName: "currency", status: "UNCERTAIN", reviewer: "founder" });
    const evaluation = evaluateField(proposals, groundTruth, "currency");
    expect(evaluation.reviewed).toBe(3);
    expect(evaluation.correct).toBe(1);
    expect(evaluation.incorrect).toBe(1);
    expect(evaluation.uncertain).toBe(1);
    expect(evaluation.accuracyOverReviewedApplicable).toBe(0.5); // 1 correct / (1 correct + 1 incorrect), uncertain excluded
  });

  it("counts false extraction when the founder says the field is actually absent", () => {
    const proposals = [proposal("doc-01", { dueDate: { raw: "2026-01-15", sourceLocation: { kind: "PDF_TEXT" } } })];
    let groundTruth = initializeGroundTruth(proposals);
    groundTruth = applyFieldLabel(groundTruth, { documentId: "doc-01", fieldName: "dueDate", status: "NOT_PRESENT_IN_DOCUMENT", reviewer: "founder" });
    const evaluation = evaluateField(proposals, groundTruth, "dueDate");
    expect(evaluation.notPresent).toBe(1);
    expect(evaluation.falseExtractionWhenAbsent).toBe(1);
  });

  it("counts a missed extraction when the pipeline proposed nothing but the founder confirms the field is present", () => {
    const proposals = [proposal("doc-01", { dueDate: { raw: null, sourceLocation: null } })];
    let groundTruth = initializeGroundTruth(proposals);
    groundTruth = applyFieldLabel(groundTruth, { documentId: "doc-01", fieldName: "dueDate", status: "INCORRECT", correctedValue: "2026-02-01", reviewer: "founder" });
    const evaluation = evaluateField(proposals, groundTruth, "dueDate");
    expect(evaluation.incorrect).toBe(1);
    expect(evaluation.missedExtractionWhenPresent).toBe(1);
  });

  it("this distinguishes case A (genuinely absent) from case B (extraction missed it) for the same raw pipeline output (0/20 due dates)", () => {
    const absentCase = [proposal("doc-01", { dueDate: { raw: null, sourceLocation: null } })];
    let gtA = initializeGroundTruth(absentCase);
    gtA = applyFieldLabel(gtA, { documentId: "doc-01", fieldName: "dueDate", status: "NOT_PRESENT_IN_DOCUMENT", reviewer: "founder" });
    expect(evaluateField(absentCase, gtA, "dueDate").falseExtractionWhenAbsent).toBe(0);
    expect(evaluateField(absentCase, gtA, "dueDate").notPresent).toBe(1);

    const missedCase = [proposal("doc-02", { dueDate: { raw: null, sourceLocation: null } })];
    let gtB = initializeGroundTruth(missedCase);
    gtB = applyFieldLabel(gtB, { documentId: "doc-02", fieldName: "dueDate", status: "INCORRECT", correctedValue: "2026-03-01", reviewer: "founder" });
    expect(evaluateField(missedCase, gtB, "dueDate").missedExtractionWhenPresent).toBe(1);
    expect(evaluateField(missedCase, gtB, "dueDate").incorrect).toBe(1);
  });

  it("reports identity fields separately rather than folding them into one aggregate", () => {
    const proposals = [proposal("doc-01")];
    const groundTruth = initializeGroundTruth(proposals);
    const report = evaluateAll(proposals, groundTruth);
    expect(Object.keys(report.perIdentityField).sort()).toEqual(["administration", "billedParty", "building", "issuer"].sort());
    expect(report.perIdentityField.issuer).not.toBe(report.perIdentityField.billedParty);
  });

  it("document-level perfect extraction rate is null until at least one document has a review, and correctly requires every reviewed field to be CORRECT", () => {
    const proposals = [proposal("doc-01"), proposal("doc-02")];
    let groundTruth = initializeGroundTruth(proposals);
    expect(evaluateAll(proposals, groundTruth).documentLevelPerfectExtractionRate).toBeNull();

    groundTruth = applyFieldLabel(groundTruth, { documentId: "doc-01", fieldName: "invoiceNumber", status: "CORRECT", reviewer: "founder" });
    groundTruth = applyFieldLabel(groundTruth, { documentId: "doc-02", fieldName: "invoiceNumber", status: "INCORRECT", correctedValue: "x", reviewer: "founder" });
    const report = evaluateAll(proposals, groundTruth);
    expect(report.documentsWithAnyReview).toBe(2);
    expect(report.documentLevelPerfectExtractionRate).toBe(0.5); // doc-01 perfect, doc-02 not
  });
});
