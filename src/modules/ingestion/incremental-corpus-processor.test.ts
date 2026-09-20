import { describe, expect, it } from "vitest";
import { IncrementalCorpusProcessor } from "./incremental-corpus-processor";
import type { DiscoveredDocument, DocumentSource } from "./document-source";
import { DeterministicDocumentUnderstandingProvider, type DocumentUnderstandingProvider, type DocumentUnderstandingRequest } from "./document-understanding-provider";
import { proposeDocumentRelationships, type CohortDocument } from "./document-relationships";
import { buildRelationshipCandidatePlan } from "./relationship-blocking";
import { CorpusProcessor } from "./corpus-processor";

function validPdf(lines: readonly string[]): Uint8Array {
  const escaped = (value: string) => value.replace(/([()\\])/g, "\\$1"); const commands = lines.map((line, index) => `BT /F1 10 Tf 40 ${800 - index * 22} Td (${escaped(line)}) Tj ET`).join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; }); const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return new TextEncoder().encode(pdf);
}

const pdf = (number: number, identity = number) => validPdf(["FACTURA B", `Nro: 0007-${String(number).padStart(8, "0")}`, "Fecha: 15/07/2026", "CUIT: 30-70000000-1", `Razon Social: Consorcio ${identity}`, `CUIT: 30-${String(80_000_000 + identity).padStart(8, "0")}-1`, `Domicilio: Calle ${identity}`, "Moneda: Peso", "Servicio documentado", "TOTAL 100000.00"]);

interface RemoteRecord { id: string; locator: string; bytes: Uint8Array; failFetch?: boolean; mimeType?: string }
class MutableRemoteSource implements DocumentSource {
  readonly sourceType = "GOOGLE_DRIVE" as const;
  records: RemoteRecord[] = [];
  failDiscovery = false;
  constructor(readonly organizationId = "org-incremental", readonly sourceId = "fake-drive") {}
  async discover(): Promise<readonly DiscoveredDocument[]> {
    if (this.failDiscovery) throw new Error("temporary discovery failure");
    // Slice into deterministic pages to exercise a Drive-like paged enumerator
    // while still satisfying the source-independent discover() contract.
    const pages = Array.from({ length: Math.ceil(this.records.length / 37) }, (_, page) => this.records.slice(page * 37, page * 37 + 37));
    return pages.flat().map((record) => ({ sourceDocumentId: record.id, displayName: record.locator.split("/").at(-1)!, mimeType: record.mimeType ?? "application/pdf", size: record.bytes.length, modifiedAt: "2026-09-20T00:00:00.000Z", supported: (record.mimeType ?? "application/pdf") === "application/pdf", provenance: { sourceType: this.sourceType, sourceId: this.sourceId, sourceDocumentId: record.id, locator: record.locator }, readContent: async () => { if (record.failFetch) throw new Error("temporary fetch failure"); return record.bytes; } }));
  }
}

class CountingProvider implements DocumentUnderstandingProvider {
  readonly id = "counting-deterministic-v1"; readonly processingVersion: string; calls = 0; documents = 0; failNext = false;
  readonly delegate = new DeterministicDocumentUnderstandingProvider();
  constructor(processingVersion = "counting-contract-v1") { this.processingVersion = processingVersion; }
  async understand(request: DocumentUnderstandingRequest) { this.calls += 1; this.documents += request.documents.length; if (this.failNext) { this.failNext = false; throw new Error("temporary provider failure"); } return this.delegate.understand(request); }
}

describe("incremental corpus intelligence", () => {
  it("is exposed through the existing CorpusProcessor entry point", async () => {
    const source = new MutableRemoteSource(); source.records = [{ id: "a", locator: "a.pdf", bytes: pdf(1) }];
    const run = await new CorpusProcessor(new CountingProvider()).processIncremental(source);
    expect(run.report.metrics).toMatchObject({ documentsUnderstood: 1, documentsReused: 0 });
  });

  it("classifies new, unchanged, changed, moved, copied, and removed records without conflating locator and content identity", async () => {
    const source = new MutableRemoteSource(); const provider = new CountingProvider(); const processor = new IncrementalCorpusProcessor(provider);
    source.records = [{ id: "a", locator: "folder/a.pdf", bytes: pdf(1) }, { id: "b", locator: "folder/b.pdf", bytes: pdf(2) }];
    const first = await processor.process(source); expect(first.report.changes.every(({ kind }) => kind === "NEW")).toBe(true); expect(first.report.metrics.documentsUnderstood).toBe(2);
    const second = await processor.process(source, first.checkpoint); expect(second.report.changes.every(({ kind }) => kind === "UNCHANGED")).toBe(true); expect(second.report.metrics).toMatchObject({ documentsUnderstood: 0, documentsReused: 2 });
    expect(second.report.summary).toEqual(first.report.summary); expect(second.report.documents[0]?.parse.understanding?.observations).toEqual(first.report.documents[0]?.parse.understanding?.observations);

    source.records = [{ id: "a", locator: "moved/a-renamed.pdf", bytes: pdf(1) }, { id: "b", locator: "folder/b.pdf", bytes: pdf(22) }, { id: "copy", locator: "other/a-copy.pdf", bytes: pdf(1) }];
    const third = await processor.process(source, second.checkpoint);
    expect(third.report.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceDocumentId: "a", kind: "LOCATOR_CHANGED" }), expect.objectContaining({ sourceDocumentId: "b", kind: "CONTENT_CHANGED" }), expect.objectContaining({ sourceDocumentId: "copy", kind: "SAME_CONTENT_DIFFERENT_SOURCE_RECORD" }),
    ]));
    expect(third.report.metrics).toMatchObject({ documentsUnderstood: 2, documentsReused: 1 });
    source.records = source.records.filter(({ id }) => id !== "b"); const fourth = await processor.process(source, third.checkpoint);
    expect(fourth.report.changes).toEqual(expect.arrayContaining([expect.objectContaining({ sourceDocumentId: "b", kind: "REMOVED" })]));
  });

  it("keeps fetch/discovery/provider failures distinct, retryable, and partially successful", async () => {
    const source = new MutableRemoteSource(); const provider = new CountingProvider(); const processor = new IncrementalCorpusProcessor(provider);
    source.records = [{ id: "good", locator: "good.pdf", bytes: pdf(1) }, { id: "flaky", locator: "flaky.pdf", bytes: pdf(2), failFetch: true }];
    const first = await processor.process(source); expect(first.report.partialSuccess).toBe(true); expect(first.report.failures).toEqual([expect.objectContaining({ kind: "CONTENT_FETCH_FAILURE", retryable: true })]);
    source.records[1]!.failFetch = false; provider.failNext = true; const second = await processor.process(source, first.checkpoint);
    expect(second.report.failures).toEqual([expect.objectContaining({ kind: "UNDERSTANDING_FAILURE", retryable: true })]); expect(second.report.partialSuccess).toBe(true);
    const third = await processor.process(source, second.checkpoint); expect(third.report.failures).toEqual([]); expect(third.report.documents).toHaveLength(2);
    source.failDiscovery = true; const failedDiscovery = await processor.process(source, third.checkpoint);
    expect(failedDiscovery.report.failures).toEqual([expect.objectContaining({ kind: "DISCOVERY_FAILURE", retryable: true })]); expect(failedDiscovery.checkpoint).toEqual(third.checkpoint);
  });

  it("rejects a checkpoint from another tenant or source", async () => {
    const a = new MutableRemoteSource("org-a", "source-a"); a.records = [{ id: "a", locator: "a.pdf", bytes: pdf(1) }];
    const checkpoint = (await new IncrementalCorpusProcessor(new CountingProvider()).process(a)).checkpoint;
    await expect(new IncrementalCorpusProcessor(new CountingProvider()).process(new MutableRemoteSource("org-b", "source-a"), checkpoint)).rejects.toThrow("CHECKPOINT_SOURCE_BOUNDARY_MISMATCH");
    await expect(new IncrementalCorpusProcessor(new CountingProvider()).process(new MutableRemoteSource("org-a", "source-b"), checkpoint)).rejects.toThrow("CHECKPOINT_SOURCE_BOUNDARY_MISMATCH");
  });

  it("invalidates reuse when the processing contract changes even if provider identity does not", async () => {
    const source = new MutableRemoteSource(); source.records = [{ id: "a", locator: "a.pdf", bytes: pdf(1) }];
    const firstProvider = new CountingProvider("parser-contract-v1");
    const first = await new IncrementalCorpusProcessor(firstProvider).process(source);
    const sameContract = await new IncrementalCorpusProcessor(new CountingProvider("parser-contract-v1")).process(source, first.checkpoint);
    expect(sameContract.report.metrics).toMatchObject({ documentsUnderstood: 0, documentsReused: 1 });

    const changedProvider = new CountingProvider("parser-contract-v2");
    const changed = await new IncrementalCorpusProcessor(changedProvider).process(source, first.checkpoint);
    expect(changedProvider.id).toBe(firstProvider.id);
    expect(changed.report.changes).toContainEqual(expect.objectContaining({ sourceDocumentId: "a", kind: "PROCESSING_VERSION_CHANGED" }));
    expect(changed.report.metrics).toMatchObject({ documentsUnderstood: 1, documentsReused: 0 });
    expect(changed.checkpoint.entries[0]?.processingVersion).toBe("parser-contract-v2");
    expect(changed.report.documents[0]?.parse.understanding?.observations[0]?.parserVersion).toBeDefined();
  });

  it("preserves all relationship results while strong-key blocking reduces candidates", async () => {
    const source = new MutableRemoteSource(); source.records = Array.from({ length: 30 }, (_, index) => ({ id: `d-${index}`, locator: `d-${index}.pdf`, bytes: pdf(index, Math.floor(index / 3)) }));
    const run = await new IncrementalCorpusProcessor(new CountingProvider()).process(source);
    const cohort: CohortDocument[] = run.report.documents.flatMap(({ source: item, parse }) => parse.understanding ? [{ documentId: item.sourceDocumentId, understanding: parse.understanding }] : []);
    const plan = buildRelationshipCandidatePlan(cohort); const naive = proposeDocumentRelationships(cohort); const blocked = proposeDocumentRelationships(cohort, plan.pairs);
    expect(blocked).toEqual(naive); expect(plan.pairsAfterBlocking).toBeLessThan(plan.pairsBeforeBlocking); expect(plan.reductionRatio).toBeGreaterThan(.8);
  });

  it("processes a paged 600-document Drive-like corpus and then reuses all 600 unchanged documents", async () => {
    const source = new MutableRemoteSource("org-scale", "drive-scale"); source.records = Array.from({ length: 600 }, (_, index) => ({ id: `remote-${index}`, locator: `page/${index}.pdf`, bytes: pdf(10_000 + index, index) }));
    const provider = new CountingProvider(); const processor = new IncrementalCorpusProcessor(provider); const started = performance.now();
    const first = await processor.process(source); const initialRuntimeMs = performance.now() - started;
    expect(first.report.metrics).toMatchObject({ documentsDiscovered: 600, documentsUnderstood: 600, candidatePairsBeforeBlocking: 179700, candidatePairsAfterBlocking: 0 });
    const second = await processor.process(source, first.checkpoint); expect(second.report.metrics).toMatchObject({ documentsUnderstood: 0, documentsReused: 600, candidatePairsBeforeBlocking: 179700, candidatePairsAfterBlocking: 0 });
    expect(second.report.summary).toEqual(first.report.summary); expect(second.report.corpusFingerprint).toBe(first.report.corpusFingerprint); expect(provider.documents).toBe(600); expect(initialRuntimeMs).toBeGreaterThan(0);
  }, 30_000);
});
