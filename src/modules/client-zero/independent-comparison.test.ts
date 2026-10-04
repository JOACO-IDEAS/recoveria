import { describe, expect, it } from "vitest";
import { compareField, compareIndependentVerification } from "./independent-comparison";
import type { DocumentProposal } from "./ground-truth-types";
import type { DocumentaryRole, IndependentDocumentVerification, IndependentFieldObservation, VerificationFieldName } from "./independent-verification-types";

const proposal = (raw: string | null) => ({ raw, normalized: raw, sourceLocation: raw ? { page: 1 } : null });
const observation = (status: IndependentFieldObservation["status"], value: string | null, role: DocumentaryRole, confidence: IndependentFieldObservation["confidence"] = "HIGH"): IndependentFieldObservation => ({ status, normalizedValue: value, rawObservedValue: value, role, confidence, page: status === "FOUND" ? 1 : null, evidence: { extractionMethod: "APPLE_VISION_OCR", text: value, boundingBox: null } });

describe("independent comparator", () => {
  it("normalizes dates, money and currency deterministically", () => {
    expect(compareField("issueDate", proposal("03/12/2024"), observation("FOUND", "2024-12-03", "ISSUE_DATE")).status).toBe("AUTO_VERIFIED_MATCH");
    expect(compareField("nominalAmount", proposal("$48.000,00"), observation("FOUND", "48000.00", "NOMINAL_AMOUNT")).status).toBe("AUTO_VERIFIED_MATCH");
    expect(compareField("currency", proposal("Peso"), observation("FOUND", "ARS", "CURRENCY")).status).toBe("AUTO_VERIFIED_MATCH");
  });

  it("distinguishes absent agreement, disagreement, ambiguity, and conservative identity review", () => {
    expect(compareField("documentedDueDate", proposal(null), observation("NOT_FOUND", null, "PAYMENT_DUE_DATE")).status).toBe("AUTO_VERIFIED_ABSENT");
    expect(compareField("issueDate", proposal("03/12/2024"), observation("FOUND", "2024-12-04", "ISSUE_DATE")).status).toBe("DISAGREEMENT");
    expect(compareField("currency", proposal("ARS"), observation("AMBIGUOUS", null, "CURRENCY")).status).toBe("AMBIGUOUS");
    expect(compareField("issuer", proposal("Example SA"), observation("FOUND", "example sa", "ISSUER", "MEDIUM")).status).toBe("HUMAN_REVIEW");
  });

  it("reports agreement as agreement, never accuracy, and computes conservative workload reduction", () => {
    const fields = Object.fromEntries(["invoiceNumber", "invoiceDate", "dueDate", "amountCents", "currency", "issuer", "billedParty", "cuit", "administration", "building", "address", "description"].map((name) => [name, proposal(name === "dueDate" ? null : "X")])) as DocumentProposal["fields"];
    const verificationFields = Object.fromEntries(["invoiceNumber", "issueDate", "documentedDueDate", "nominalAmount", "currency", "issuer", "billedCustomer", "administration", "building", "servicePeriod"].map((name) => [name, name === "documentedDueDate" ? observation("NOT_FOUND", null, "PAYMENT_DUE_DATE") : observation("FOUND", name === "servicePeriod" ? "2024-12" : "x", ({ invoiceNumber: "INVOICE_NUMBER", issueDate: "ISSUE_DATE", nominalAmount: "NOMINAL_AMOUNT", currency: "CURRENCY", issuer: "ISSUER", billedCustomer: "BILLED_CUSTOMER", administration: "ADMINISTRATION", building: "BUILDING", servicePeriod: "SERVICE_PERIOD" } as Record<string, DocumentaryRole>)[name] ?? "ISSUE_DATE")])) as Record<VerificationFieldName, IndependentFieldObservation>;
    const proposals: DocumentProposal[] = Array.from({ length: 20 }, (_, index) => ({ documentId: `db-${index}`, privateSafeDocumentId: `doc-${index}`, importBatchId: "batch", reviewReasons: [], pdfFileName: `private-${index}.pdf`, fields }));
    const observations: IndependentDocumentVerification[] = Array.from({ length: 20 }, (_, index) => ({ documentId: `doc-${index}`, inputSha256: "a".repeat(64), pageCount: 1, verifier: { provider: "APPLE_VISION_OCR", version: "test" }, observedAt: "2026-01-01T00:00:00.000Z", fields: verificationFields }));
    const result = compareIndependentVerification(proposals, observations);
    expect(result.totals.totalReviewableFields).toBe(180);
    expect(result.totals.absentAgreement).toBe(20);
    expect(result.totals.estimatedManualWorkReduction).toBeGreaterThan(0);
    expect(Object.keys(result)).not.toContain("accuracy");
  });
});
