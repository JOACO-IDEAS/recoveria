import { describe, expect, it } from "vitest";
import { buildWorkspaceDocument, assertPersistedTotalsMatchWorkspace, assertWorkspaceArtifactVersions, summarizeWorkspace } from "./review-workspace-model";
import { initializeGroundTruth, applyFieldLabel } from "./ground-truth-store";
import type { DocumentProposal } from "./ground-truth-types";
import type { IndependentDocumentVerification } from "./independent-verification-types";
import type { DocumentComparison } from "./independent-comparison";

const field = (raw: string | null) => ({ raw, normalized: raw, sourceLocation: null });
const proposal: DocumentProposal = { documentId: "db", privateSafeDocumentId: "doc-01", importBatchId: "batch", reviewReasons: [], pdfFileName: "private.pdf", fields: Object.fromEntries(["invoiceNumber", "invoiceDate", "dueDate", "amountCents", "currency", "issuer", "billedParty", "cuit", "administration", "building", "address", "description"].map((name) => [name, field("x")])) as DocumentProposal["fields"] };
const observation = (status: "FOUND" | "NOT_FOUND" | "AMBIGUOUS", role: IndependentDocumentVerification["fields"]["issueDate"]["role"]) => ({ status, normalizedValue: status === "FOUND" ? "x" : null, rawObservedValue: status === "FOUND" ? "x" : null, role, confidence: "HIGH" as const, page: status === "FOUND" ? 1 : null, evidence: { extractionMethod: "APPLE_VISION_OCR" as const, text: null, boundingBox: null } });
const verification: IndependentDocumentVerification = { documentId: "doc-01", inputSha256: "a".repeat(64), pageCount: 1, verifier: { provider: "APPLE_VISION_OCR", version: "test" }, observedAt: "2026-01-01T00:00:00Z", fields: { invoiceNumber: observation("FOUND", "INVOICE_NUMBER"), issueDate: observation("FOUND", "ISSUE_DATE"), documentedDueDate: observation("NOT_FOUND", "PAYMENT_DUE_DATE"), nominalAmount: observation("FOUND", "NOMINAL_AMOUNT"), currency: observation("AMBIGUOUS", "CURRENCY"), issuer: observation("FOUND", "ISSUER"), billedCustomer: observation("FOUND", "BILLED_CUSTOMER"), administration: observation("NOT_FOUND", "ADMINISTRATION"), building: observation("FOUND", "BUILDING"), servicePeriod: observation("NOT_FOUND", "SERVICE_PERIOD") } };
const comparison: DocumentComparison = { documentId: "doc-01", fields: Object.fromEntries(["invoiceNumber", "issueDate", "documentedDueDate", "nominalAmount", "currency", "issuer", "billedCustomer", "administration", "building"].map((name) => [name, { field: name, proposalField: "invoiceNumber", status: name === "issueDate" ? "AUTO_VERIFIED_MATCH" : name === "documentedDueDate" ? "AUTO_VERIFIED_ABSENT" : name === "currency" ? "AMBIGUOUS" : "DISAGREEMENT", proposalPresent: true, observationStatus: "FOUND" }])) as DocumentComparison["fields"] };

describe("review workspace canonical model", () => {
  it("maps API/UI fields to the persisted observation and comparison status", () => {
    const groundTruth = initializeGroundTruth([proposal])["doc-01"]!;
    const model = buildWorkspaceDocument(proposal, verification, comparison, groundTruth);
    expect(model.workspaceFields.invoiceDate.observation).toBe(verification.fields.issueDate);
    expect(model.workspaceFields.invoiceDate.semanticStatus).toBe(comparison.fields.issueDate.status);
    expect(model.workspaceFields.dueDate.semanticStatus).toBe("AUTO_VERIFIED_ABSENT");
    expect(model.workspaceFields.currency.semanticStatus).toBe("AMBIGUOUS");
    expect(model.workspaceFields.cuit.semanticStatus).toBe("NOT_COMPARABLE");
  });

  it("derives summary from the exact records exposed to the UI", () => {
    const model = buildWorkspaceDocument(proposal, verification, comparison, initializeGroundTruth([proposal])["doc-01"]!);
    const summary = summarizeWorkspace([model]);
    expect(summary).toMatchObject({ comparable: 9, matches: 1, absentAgreement: 1, disagreements: 6, ambiguous: 1, notComparable: 0, autoVerifiable: 2, humanRequired: 7 });
  });

  it("fails visibly on missing layers or schema mismatch", () => {
    const groundTruth = initializeGroundTruth([proposal])["doc-01"]!;
    expect(() => buildWorkspaceDocument(proposal, undefined, comparison, groundTruth)).toThrow(/VERIFICATION_MISSING/);
    expect(() => buildWorkspaceDocument(proposal, verification, undefined, groundTruth)).toThrow(/COMPARISON_MISSING/);
    expect(() => assertWorkspaceArtifactVersions({ schemaVersion: 1, verifierContractVersion: "wrong" } as never, { schemaVersion: 1, comparisonContractVersion: "phase-8b2a-v1" } as never)).toThrow(/SCHEMA_MISMATCH/);
    const missingField = { ...verification, fields: { ...verification.fields, issueDate: undefined } } as unknown as IndependentDocumentVerification;
    expect(buildWorkspaceDocument(proposal, missingField, comparison, groundTruth).workspaceFields.invoiceDate.semanticStatus).toBe("MISSING_VERIFIER_OBSERVATION");
  });

  it("rejects persisted aggregate totals that differ from UI-consumable records", () => {
    const model = buildWorkspaceDocument(proposal, verification, comparison, initializeGroundTruth([proposal])["doc-01"]!);
    const summary = summarizeWorkspace([model]);
    expect(() => assertPersistedTotalsMatchWorkspace({ ...summary, totalReviewableFields: 9 } as never, summary)).not.toThrow();
    expect(() => assertPersistedTotalsMatchWorkspace({ ...summary, matches: 2, totalReviewableFields: 9 } as never, summary)).toThrow(/AGGREGATE_MISMATCH:matches/);
  });

  it("does not mutate or replace founder labels during model refresh", () => {
    const labelled = applyFieldLabel(initializeGroundTruth([proposal]), { documentId: "doc-01", fieldName: "invoiceNumber", status: "CORRECT", reviewer: "founder" }, () => "2026-01-01T00:00:00Z");
    const before = JSON.stringify(labelled);
    buildWorkspaceDocument(proposal, verification, comparison, labelled["doc-01"]!);
    expect(JSON.stringify(labelled)).toBe(before);
    expect(labelled["doc-01"]!.fields.invoiceNumber.status).toBe("CORRECT");
  });
});
