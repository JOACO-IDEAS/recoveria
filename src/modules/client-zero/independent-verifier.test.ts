import { describe, expect, it } from "vitest";
import { interpretVisionOCR } from "./independent-verifier";
import { VERIFICATION_FIELD_NAMES, type BlindVerificationInput } from "./independent-verification-types";

const line = (text: string, y: number, confidence = 0.99) => ({ page: 1, text, confidence, x: 0.1, y, width: 0.8, height: 0.02 });

describe("blind independent verifier", () => {
  it("has a minimal input contract with no pipeline, confidence, candidate, or ground-truth values", () => {
    const input: BlindVerificationInput = { documentId: "opaque-document", pdfPath: "/private/opaque.pdf", sha256: "a".repeat(64) };
    expect(Object.keys(input).sort()).toEqual(["documentId", "pdfPath", "sha256"]);
    expect(JSON.stringify(input)).not.toMatch(/proposal|extractedField|candidate|groundTruth|expectedValue|confidence/i);
  });

  it("observes issue date and service period as distinct documentary roles", () => {
    const result = interpretVisionOCR({ provider: "APPLE_VISION_OCR", providerVersion: "test", pageCount: 1, lines: [
      line("Fecha: 03/12/2024", 0.9), line("Descripción: servicio DICIEMBRE 2024", 0.5),
    ] }, { documentId: "opaque", pdfPath: "/private/opaque.pdf", sha256: "b".repeat(64) }, () => "2026-01-01T00:00:00.000Z");
    expect(result.fields.issueDate).toMatchObject({ status: "FOUND", normalizedValue: "2024-12-03", role: "ISSUE_DATE" });
    expect(result.fields.servicePeriod).toMatchObject({ status: "FOUND", normalizedValue: "2024-12", role: "SERVICE_PERIOD" });
    expect(result.fields.documentedDueDate.status).toBe("NOT_FOUND");
  });

  it("never treats fiscal authorization expiry as payment due date", () => {
    const result = interpretVisionOCR({ provider: "APPLE_VISION_OCR", providerVersion: "test", pageCount: 1, lines: [line("Vto. CAE: 15/12/2024", 0.5)] }, { documentId: "opaque", pdfPath: "/private/opaque.pdf", sha256: "c".repeat(64) });
    expect(result.fields.documentedDueDate.status).toBe("NOT_FOUND");
  });

  it("preserves explicit customer and building roles instead of collapsing identity", () => {
    const result = interpretVisionOCR({ provider: "APPLE_VISION_OCR", providerVersion: "test", pageCount: 1, lines: [line("Apellido y Nombre / Razón Social: CONSORCIO EJEMPLO", 0.7)] }, { documentId: "opaque", pdfPath: "/private/opaque.pdf", sha256: "d".repeat(64) });
    expect(result.fields.billedCustomer).toMatchObject({ status: "FOUND", role: "BILLED_CUSTOMER" });
    expect(result.fields.building).toMatchObject({ status: "FOUND", role: "BUILDING" });
    expect(Object.keys(result.fields)).toEqual([...VERIFICATION_FIELD_NAMES]);
  });
});
