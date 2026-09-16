import { describe, expect, it } from "vitest";
import { buildInvoiceCandidate } from "./candidate-builder";
import { DuplicateDetector } from "./duplicate-detector";
import { ImportOrchestrator } from "./import-orchestrator";
import { decodeLocalPdf, __private__ } from "./parsers/local-pdf-decoder";
import type { DocumentInput, DocumentObservation } from "./types";

const ORG = "org-synthetic-pdf-evaluation";

function validPdf(lines: readonly string[]): Uint8Array {
  const escaped = (value: string) => value.replace(/([()\\])/g, "\\$1");
  const commands = lines.map((line, index) => `BT /F1 10 Tf 40 ${800 - index * 22} Td (${escaped(line)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

const fixtureLines = [
  "FACTURA B", "Nro: 0007-00001234", "Fecha: 15/07/2026",
  "Inicio de actividades: 19/04/2018", "CUIT: 30-70000000-1",
  "Razon Social: Consorcio Sintetico", "CUIT: 30-71111111-8",
  "Domicilio: Calle Ficticia 123", "Moneda: Peso",
  "Trabajo de mantenimiento JULIO 2026 segun presupuesto de fecha 01.07.2026",
  "ANTICIPO 40%", "IVA Contenido: $ 21.000,00", "TOTAL 121000.00",
  "CAE: 70123456789012", "Vto: 25/07/2026",
] as const;

describe("local real-PDF document understanding", () => {
  it("decodes native PDF text and retains page/region/method provenance", async () => {
    const result = await decodeLocalPdf("synthetic-native", validPdf(fixtureLines));
    expect(result.understanding?.invoiceNumber.normalized).toBe("0007-00001234");
    expect(result.understanding?.observations.length).toBeGreaterThan(10);
    expect(result.evidence.invoiceNumber.location).toEqual(expect.objectContaining({ page: 1, extractionMethod: "LOCAL_PDF_NATIVE", parserVersion: "recoveria-local-pdf-v1" }));
    expect(result.evidence.invoiceNumber.location.region).toBeDefined();
  });

  it("keeps fiscal expiry and issuer registration separate from issue and payment-due dates", async () => {
    const result = await decodeLocalPdf("synthetic-dates", validPdf(fixtureLines));
    const dates = result.understanding?.dates ?? [];
    expect(dates.find(({ semantic }) => semantic === "ISSUE_DATE")?.normalized).toBe("2026-07-15");
    expect(dates.find(({ semantic }) => semantic === "FISCAL_AUTHORIZATION_EXPIRY")?.normalized).toBe("2026-07-25");
    expect(dates.find(({ semantic }) => semantic === "ISSUER_REGISTRATION_DATE")?.normalized).toBe("2018-04-19");
    expect(dates.find(({ semantic }) => semantic === "PAYMENT_DUE_DATE")?.normalized).toBeNull();
    expect(result.values.dueDate).toBeUndefined();
  });

  it("keeps nominal value documentary and stage/project relationships non-definitive", async () => {
    const understanding = (await decodeLocalPdf("synthetic-safety", validPdf(fixtureLines))).understanding;
    expect(understanding?.documentedNominalTotalCents).toEqual(expect.objectContaining({ normalized: 12_100_000, classification: "FACT" }));
    expect(understanding).not.toHaveProperty("currentOutstandingCents");
    expect(understanding?.installmentStage).toEqual(expect.objectContaining({ classification: "INFERENCE", confidence: "MEDIUM" }));
    expect(understanding?.relationshipCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "POSSIBLE_STAGE_OF", status: "CANDIDATE", classification: "INFERENCE" })]));
  });

  it("types an explicit service month as inferred boundaries with reviewable provenance", async () => {
    const understanding = (await decodeLocalPdf("synthetic-period", validPdf(fixtureLines))).understanding;
    expect(understanding?.servicePeriodStart).toEqual(expect.objectContaining({ normalized: "2026-07-01", classification: "INFERENCE", confidence: "MEDIUM" }));
    expect(understanding?.servicePeriodEnd.normalized).toBe("2026-07-31");
    expect(understanding?.servicePeriodStart.observationIds.length).toBeGreaterThan(0);
  });

  it("returns unavailable/unknown rather than fabricating absent fields", () => {
    const observations: DocumentObservation[] = [{ id: "o1", documentId: "sparse", page: 1, observationType: "TEXT", observedText: "FACTURA", region: { x: 10, y: 10, width: 20, height: 10 }, extractionMethod: "LOCAL_PDF_NATIVE", parserVersion: "test", confidence: "HIGH" }];
    const understanding = __private__.buildUnderstanding("sparse", observations);
    expect(understanding.documentedNominalTotalCents).toEqual(expect.objectContaining({ status: "MISSING", confidence: "UNAVAILABLE", classification: "UNKNOWN" }));
    expect(understanding.customerTaxId.normalized).toBeNull();
  });

  it("fails safely when a valid PDF contains no native text", async () => {
    const blank = validPdf([]);
    await expect(decodeLocalPdf("blank", blank)).rejects.toThrow("PDF_NATIVE_TEXT_UNAVAILABLE");
    const [result] = (await new ImportOrchestrator().run(ORG, "blank-pdf", [{ id: "blank", organizationId: ORG, fileName: "blank.pdf", declaredMediaType: "application/pdf", bytes: blank }], [])).results;
    expect(result).toEqual(expect.objectContaining({ status: "REVIEW_REQUIRED", reviewReasons: ["OCR_REQUIRED_OFFLINE_ADAPTER_NOT_IMPLEMENTED"] }));
  });
});

describe("real-pattern duplicate safety", () => {
  it("does not collapse recurring equal-value invoices or installment stages with distinct numbers", () => {
    const detector = new DuplicateDetector();
    const document = (id: string): DocumentInput => ({ id, organizationId: ORG, fileName: `${id}.pdf`, declaredMediaType: "application/pdf", bytes: new TextEncoder().encode(id) });
    const candidate = (number: string, description: string) => buildInvoiceCandidate("source", 0, { values: { invoiceNumber: number, invoiceDate: "15/07/2026", amount: "100000.00", currency: "ARS", issuer: "Proveedor Sintetico", description }, evidence: {} }, []);
    expect(detector.inspect(document("monthly-a"), [candidate("A-100", "Servicio mensual JUNIO 2026")])).toHaveLength(0);
    expect(detector.inspect(document("monthly-b"), [candidate("A-101", "Servicio mensual JULIO 2026")])).toHaveLength(0);
    expect(detector.inspect(document("stage-a"), [candidate("B-200", "ANTICIPO 50%")])).toHaveLength(0);
    expect(detector.inspect(document("stage-b"), [candidate("B-201", "SALDO")])).toHaveLength(0);
  });
});
