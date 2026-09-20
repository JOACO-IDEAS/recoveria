import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CorpusProcessor } from "./corpus-processor";
import { DeterministicDocumentUnderstandingProvider, type DocumentUnderstandingProvider, type DocumentUnderstandingRequest } from "./document-understanding-provider";
import { LocalFolderSource } from "./local-folder-source";

function validPdf(lines: readonly string[]): Uint8Array {
  const escaped = (value: string) => value.replace(/([()\\])/g, "\\$1");
  const commands = lines.map((line, index) => `BT /F1 10 Tf 40 ${800 - index * 22} Td (${escaped(line)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function invoicePdf(number: number, customerTaxId = "30-71111111-8", customerName = "Consorcio Sintetico", address = "Calle Ficticia 123"): Uint8Array {
  return validPdf(["FACTURA B", `Nro: 0007-${String(number).padStart(8, "0")}`, "Fecha: 15/07/2026", "CUIT: 30-70000000-1", `Razon Social: ${customerName}`, `CUIT: ${customerTaxId}`, `Domicilio: ${address}`, "Moneda: Peso", "Servicio de mantenimiento JULIO 2026", "TOTAL 121000.00"]);
}

async function tempRoot(): Promise<string> { return mkdtemp(path.join(os.tmpdir(), "recoveria-corpus-")); }

describe("source-agnostic corpus processing", () => {
  it("discovers recursively, fingerprints content, and records unsupported files", async () => {
    const root = await tempRoot(); await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "nested", "invoice.pdf"), invoicePdf(1));
    await writeFile(path.join(root, "notes.txt"), "not a supported document");
    const source = await LocalFolderSource.create("org-a", "local-a", root);
    const discovered = await source.discover();
    expect(discovered.map(({ provenance }) => provenance.locator)).toEqual(["nested/invoice.pdf", "notes.txt"]);
    const report = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(source);
    expect(report.summary).toMatchObject({ documentsWithResult: 2, documentsUnsupported: 1, documentsClassifiedAsInvoice: 1 });
    expect(report.documents.every(({ source: item }) => item.fingerprintSha256.length === 64)).toBe(true);
  });

  it("keeps unknown classification and abstention instead of forcing an invoice", async () => {
    const root = await tempRoot(); await writeFile(path.join(root, "unknown.pdf"), validPdf(["DOCUMENTO SIN CLASIFICACION", "Referencia interna"]));
    const report = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(await LocalFolderSource.create("org-a", "unknown", root));
    expect(report.documents[0]?.classification).toBe("UNKNOWN_DOCUMENT");
    expect(report.summary.abstentions).toBeGreaterThan(0);
  });

  it("routes through the configured provider and is idempotent for repeated processing", async () => {
    const root = await tempRoot(); await writeFile(path.join(root, "invoice.pdf"), invoicePdf(2));
    const delegate = new DeterministicDocumentUnderstandingProvider(); let calls = 0; const keys: string[] = [];
    const provider: DocumentUnderstandingProvider = { id: "spy", processingVersion: "spy-v1", understand(request: DocumentUnderstandingRequest) { calls += 1; keys.push(request.idempotencyKey); return delegate.understand(request); } };
    const source = await LocalFolderSource.create("org-a", "repeatable", root); const processor = new CorpusProcessor(provider);
    const first = await processor.process(source); const second = await processor.process(source);
    expect(calls).toBe(2); expect(keys[0]).toBe(keys[1]); expect(second.corpusFingerprint).toBe(first.corpusFingerprint);
    expect(second.summary).toEqual(first.summary);
  });

  it("preserves observation provenance and finds exact duplicates without collapsing them", async () => {
    const root = await tempRoot(); const bytes = invoicePdf(3);
    await writeFile(path.join(root, "one.pdf"), bytes); await writeFile(path.join(root, "two.pdf"), bytes);
    const report = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(await LocalFolderSource.create("org-a", "duplicates", root));
    expect(report.summary.exactDuplicates).toBe(1); expect(report.documents).toHaveLength(2);
    const observations = report.documents[0]?.parse.understanding?.observations ?? [];
    expect(observations.every(({ page, region, extractionMethod, parserVersion }) => page > 0 && region && extractionMethod && parserVersion)).toBe(true);
  });

  it("clusters strong identities, reports contradictions, and preserves relationship inference", async () => {
    const root = await tempRoot();
    await writeFile(path.join(root, "a.pdf"), invoicePdf(10, "30-71111111-8", "Consorcio X", "Calle Ficticia 123"));
    await writeFile(path.join(root, "b.pdf"), invoicePdf(11, "30-72222222-6", "Consorcio X", "Calle Ficticia 123"));
    const report = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(await LocalFolderSource.create("org-a", "contradiction", root));
    expect(report.summary.identityClusters).toBe(2); expect(report.summary.identityConflicts).toBe(2); expect(report.summary.contradictions).toBeGreaterThanOrEqual(2);
    expect(report.relationships.proposals.every(({ classification }) => classification === "INFERENCE")).toBe(true);
  });

  it("isolates stable source identities by source and tenant", async () => {
    const root = await tempRoot(); await writeFile(path.join(root, "invoice.pdf"), invoicePdf(20));
    const a = await LocalFolderSource.create("org-a", "source-a", root); const b = await LocalFolderSource.create("org-a", "source-b", root); const c = await LocalFolderSource.create("org-b", "source-a", root);
    const [docA] = await a.discover(); const [docB] = await b.discover(); const [docC] = await c.discover();
    expect(docA?.sourceDocumentId).not.toBe(docB?.sourceDocumentId);
    expect(docA?.sourceDocumentId).not.toBe(docC?.sourceDocumentId);
    const reportA = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(a);
    const reportC = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(c);
    expect(reportA.organizationId).toBe("org-a"); expect(reportC.organizationId).toBe("org-b");
  });

  it("processes a synthetic corpus substantially larger than 20 and reports the O(n²) relationship risk", async () => {
    const root = await tempRoot();
    await Promise.all(Array.from({ length: 64 }, (_, index) => writeFile(path.join(root, `invoice-${index}.pdf`), invoicePdf(1_000 + index, `30-${String(80_000_000 + index).padStart(8, "0")}-1`, `Consorcio ${index}`, `Calle ${index}`))));
    const report = await new CorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(await LocalFolderSource.create("org-scale", "scale", root));
    expect(report.summary.documentsWithResult).toBe(64); expect(report.summary.documentsProcessed).toBe(64);
    expect(report.scalability).toMatchObject({ relationshipComparisonComplexity: "O(n²)", warningThreshold: 1_000, warning: null });
  }, 20_000);
});
