import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DiscoveredDocument, SourceChangeSet, SourceCursor } from "./document-source";
import { DeterministicDocumentUnderstandingProvider, type DocumentUnderstandingProvider, type DocumentUnderstandingRequest } from "./document-understanding-provider";
import type { DriveFileDescriptor, DriveFilePage, GoogleDriveSourceContract } from "./google-drive-source-contract";
import { DriveSourceFetchError } from "./google-drive-source-contract";
import { IncrementalCorpusProcessor } from "./incremental-corpus-processor";
import { proposeDocumentRelationships, type CohortDocument } from "./document-relationships";
import { buildRelationshipCandidatePlan } from "./relationship-blocking";
import { LocalFileSourceCheckpointStore } from "./source-checkpoint-store";

function validPdf(number: number, customer: number, missingTaxId = false, taxIdentity = customer): Uint8Array {
  const lines = ["FACTURA B", `Nro: 0007-${String(number).padStart(8, "0")}`, "Fecha: 15/07/2026", "CUIT: 30-70000000-1", `Razon Social: Consorcio ${customer}`, ...(missingTaxId ? [] : [`CUIT: 30-${String(80_000_000 + taxIdentity).padStart(8, "0")}-1`]), `Domicilio: Calle ${customer}`, "Moneda: Peso", "Servicio documentado", "TOTAL 100000.00"];
  const escaped = (value: string) => value.replace(/([()\\])/g, "\\$1"); const commands = lines.map((line, index) => `BT /F1 10 Tf 40 ${800 - index * 22} Td (${escaped(line)}) Tj ET`).join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; }); const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return new TextEncoder().encode(pdf);
}

interface FakeDriveRecord extends DriveFileDescriptor { bytes: Uint8Array }
class FakeDriveSource implements GoogleDriveSourceContract {
  readonly sourceType = "GOOGLE_DRIVE" as const; records: FakeDriveRecord[] = []; pageSize = 37; cursorRevision = 1; cursorInvalid = false; fullDiscoveries = 0; changeDiscoveries = 0;
  currentCursorFailure = false; changeDiscoveryFailure = false; returnedCursor: "VALID" | "MALFORMED" | "WRONG_BOUNDARY" = "VALID";
  readonly fetchFailures = new Map<string, number>();
  constructor(readonly organizationId = "org-drive", readonly sourceId = "drive-a") {}
  async listPage(pageToken?: string): Promise<DriveFilePage> {
    const start = pageToken ? Number(pageToken) : 0; const ordered = [...this.records].sort((a, b) => a.fileId.localeCompare(b.fileId)); const files = ordered.slice(start, start + this.pageSize);
    return { files, nextPageToken: start + this.pageSize < ordered.length ? String(start + this.pageSize) : undefined };
  }
  async readFileContent(fileId: string): Promise<Uint8Array> {
    const remaining = this.fetchFailures.get(fileId) ?? 0; if (remaining > 0) { this.fetchFailures.set(fileId, remaining - 1); throw new DriveSourceFetchError("DRIVE_TEMPORARY_FETCH_FAILURE", "RETRYABLE"); }
    const record = this.records.find((item) => item.fileId === fileId); if (!record) throw new DriveSourceFetchError("DRIVE_FILE_NOT_FOUND", "TERMINAL"); return record.bytes;
  }
  toDiscoveredDocument(file: DriveFileDescriptor): DiscoveredDocument {
    return { sourceDocumentId: file.fileId, displayName: file.displayName, mimeType: file.mimeType, size: file.size, modifiedAt: file.modifiedAt, supported: file.mimeType === "application/pdf", provenance: { sourceType: this.sourceType, sourceId: this.sourceId, sourceDocumentId: file.fileId, locator: file.locator }, readContent: () => this.readFileContent(file.fileId) };
  }
  async discover(): Promise<readonly DiscoveredDocument[]> {
    this.fullDiscoveries += 1; const result: DiscoveredDocument[] = []; let token: string | undefined;
    do { const page = await this.listPage(token); result.push(...page.files.map((file) => this.toDiscoveredDocument(file))); token = page.nextPageToken; } while (token);
    return result;
  }
  async currentCursor(): Promise<SourceCursor> {
    if (this.currentCursorFailure) throw new Error("cursor unavailable");
    if (this.returnedCursor === "MALFORMED") return null as unknown as SourceCursor;
    return { organizationId: this.organizationId, sourceType: this.sourceType, sourceId: this.returnedCursor === "WRONG_BOUNDARY" ? "other-drive" : this.sourceId, value: `cursor-${this.cursorRevision}` };
  }
  async discoverChanges(cursor: SourceCursor): Promise<SourceChangeSet> {
    this.changeDiscoveries += 1;
    if (this.changeDiscoveryFailure) throw new Error("change cursor unavailable");
    const wrongBoundary = cursor.organizationId !== this.organizationId || cursor.sourceType !== this.sourceType || cursor.sourceId !== this.sourceId;
    return { status: this.cursorInvalid || wrongBoundary ? "EXPIRED" : "VALID", changedDocuments: [], removedSourceDocumentIds: [], nextCursor: await this.currentCursor() };
  }
  put(fileId: string, locator: string, bytes: Uint8Array): void {
    const descriptor: FakeDriveRecord = { fileId, displayName: locator.split("/").at(-1)!, locator, mimeType: "application/pdf", size: bytes.length, modifiedAt: "2026-09-20T00:00:00.000Z", bytes };
    const index = this.records.findIndex((item) => item.fileId === fileId); if (index >= 0) this.records[index] = descriptor; else this.records.push(descriptor); this.cursorRevision += 1;
  }
}

class CountingProvider implements DocumentUnderstandingProvider {
  readonly id = "drive-contract-provider"; calls = 0; documents = 0; readonly delegate = new DeterministicDocumentUnderstandingProvider();
  constructor(readonly processingVersion = "drive-contract-v1") {}
  async understand(request: DocumentUnderstandingRequest) { this.calls += 1; this.documents += request.documents.length; return this.delegate.understand(request); }
}

const oneFile = (): FakeDriveSource => { const source = new FakeDriveSource(); source.put("stable-id", "folder/a.pdf", validPdf(1, 1)); return source; };

describe("offline GoogleDriveSource contract", () => {
  it("preserves identity across rename", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.put("stable-id", "folder/renamed.pdf", validPdf(1, 1)); const second = await processor.process(source, first.checkpoint); expect(second.report.changes).toContainEqual(expect.objectContaining({ sourceDocumentId: "stable-id", kind: "LOCATOR_CHANGED" })); });
  it("preserves identity across move", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.put("stable-id", "other/a.pdf", validPdf(1, 1)); const second = await processor.process(source, first.checkpoint); expect(second.report.changes).toContainEqual(expect.objectContaining({ sourceDocumentId: "stable-id", kind: "LOCATOR_CHANGED" })); });
  it("detects byte modification", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.put("stable-id", "folder/a.pdf", validPdf(2, 1)); const second = await processor.process(source, first.checkpoint); expect(second.report.changes).toContainEqual(expect.objectContaining({ kind: "CONTENT_CHANGED" })); });
  it("reuses an unchanged trusted parse", async () => { const source = oneFile(); const provider = new CountingProvider(); const processor = new IncrementalCorpusProcessor(provider); const first = await processor.process(source); const second = await processor.process(source, first.checkpoint); expect(second.report.metrics).toMatchObject({ documentsUnderstood: 0, documentsReused: 1 }); expect(provider.documents).toBe(1); });
  it("makes deletion explicit", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.records = []; const second = await processor.process(source, first.checkpoint); expect(second.report.changes).toContainEqual(expect.objectContaining({ sourceDocumentId: "stable-id", kind: "REMOVED" })); });
  it("keeps identical bytes under another Drive ID as a separate source record", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.put("copy-id", "copy/a.pdf", validPdf(1, 1)); const second = await processor.process(source, first.checkpoint); expect(second.report.changes).toContainEqual(expect.objectContaining({ sourceDocumentId: "copy-id", priorSourceDocumentId: "stable-id", kind: "SAME_CONTENT_DIFFERENT_SOURCE_RECORD" })); });
  it("paginates deterministically", async () => { const source = new FakeDriveSource(); source.pageSize = 3; for (let index = 9; index >= 0; index--) source.put(`id-${index}`, `${index}.pdf`, validPdf(index, index)); const first = await source.discover(); const second = await source.discover(); expect(first.map((item) => item.sourceDocumentId)).toEqual(second.map((item) => item.sourceDocumentId)); expect(first.map((item) => item.sourceDocumentId)).toEqual([...first.map((item) => item.sourceDocumentId)].sort()); });
  it("retries a temporary fetch failure without erasing trusted state", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.fetchFailures.set("stable-id", 1); const failed = await processor.process(source, first.checkpoint); expect(failed.report.failures).toContainEqual(expect.objectContaining({ kind: "CONTENT_FETCH_FAILURE", retryable: true })); expect(failed.checkpoint.entries).toHaveLength(1); const retried = await processor.process(source, failed.checkpoint); expect(retried.report.failures).toHaveLength(0); expect(retried.report.documents).toHaveLength(1); });
  it("falls back to authoritative full discovery when a cursor expires", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.cursorInvalid = true; const second = await processor.process(source, first.checkpoint); expect(source.changeDiscoveries).toBe(1); expect(source.fullDiscoveries).toBe(2); expect(second.report.documents).toHaveLength(1); expect(second.checkpoint.cursor?.value).toBe(`cursor-${source.cursorRevision}`); });
  it("keeps a successful first full run when currentCursor fails", async () => { const source = oneFile(); source.currentCursorFailure = true; const run = await new IncrementalCorpusProcessor(new CountingProvider()).process(source); expect(run.report.documents).toHaveLength(1); expect(run.report.failures).toHaveLength(0); expect(run.checkpoint.cursor).toBeUndefined(); });
  it("drops malformed and wrong-boundary returned cursors without discarding document truth", async () => { for (const returnedCursor of ["MALFORMED", "WRONG_BOUNDARY"] as const) { const source = oneFile(); source.returnedCursor = returnedCursor; const run = await new IncrementalCorpusProcessor(new CountingProvider()).process(source); expect(run.report.documents).toHaveLength(1); expect(run.checkpoint.cursor).toBeUndefined(); } });
  it("recovers from discoverChanges failure when a fresh currentCursor succeeds", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.changeDiscoveryFailure = true; source.cursorRevision += 1; const second = await processor.process(source, first.checkpoint); expect(second.report.documents).toHaveLength(1); expect(second.checkpoint.cursor?.value).toBe(`cursor-${source.cursorRevision}`); });
  it("keeps full-discovery truth when discoverChanges and currentCursor both fail", async () => { const source = oneFile(); const processor = new IncrementalCorpusProcessor(new CountingProvider()); const first = await processor.process(source); source.changeDiscoveryFailure = true; source.currentCursorFailure = true; const second = await processor.process(source, first.checkpoint); expect(second.report.documents).toHaveLength(1); expect(second.report.metrics).toMatchObject({ documentsUnderstood: 0, documentsReused: 1 }); expect(second.checkpoint.cursor).toBeUndefined(); });
  it("enforces tenant, source, and cursor boundaries", async () => { const source = oneFile(); const checkpoint = (await new IncrementalCorpusProcessor(new CountingProvider()).process(source)).checkpoint; await expect(new IncrementalCorpusProcessor(new CountingProvider()).process(new FakeDriveSource("other-org", source.sourceId), checkpoint)).rejects.toThrow("CHECKPOINT_SOURCE_BOUNDARY_MISMATCH"); const badCursor = { ...checkpoint, cursor: { ...checkpoint.cursor!, sourceId: "other-drive" } }; await expect(new IncrementalCorpusProcessor(new CountingProvider()).process(source, badCursor)).rejects.toThrow("SOURCE_CURSOR_BOUNDARY_MISMATCH"); });
  it("invalidates reuse on processing-version change", async () => { const source = oneFile(); const first = await new IncrementalCorpusProcessor(new CountingProvider("contract-v1")).process(source); const second = await new IncrementalCorpusProcessor(new CountingProvider("contract-v2")).process(source, first.checkpoint); expect(second.report.changes).toContainEqual(expect.objectContaining({ kind: "PROCESSING_VERSION_CHANGED" })); expect(second.report.metrics.documentsUnderstood).toBe(1); });

  it("matches exhaustive relationships and survives checkpoint serialization across a 520-file paged corpus", async () => {
    const source = new FakeDriveSource("org-scale", "drive-scale"); source.pageSize = 41;
    for (let index = 0; index < 520; index++) { const customer = index % 40; source.put(`file-${String(index).padStart(4, "0")}`, `batch-${Math.floor(index / 41)}/${index}.pdf`, validPdf(10_000 + index, customer, index % 17 === 0, index % 23 === 0 ? customer + 1_000 : customer)); }
    const provider = new CountingProvider(); const processor = new IncrementalCorpusProcessor(provider); const first = await processor.process(source);
    const cohort: CohortDocument[] = first.report.documents.flatMap(({ source: item, parse }) => parse.understanding ? [{ documentId: item.sourceDocumentId, understanding: parse.understanding }] : []);
    const plan = buildRelationshipCandidatePlan(cohort); const blocked = proposeDocumentRelationships(cohort, plan.pairs); expect(blocked).toEqual(proposeDocumentRelationships(cohort)); expect(plan.pairsBeforeBlocking).toBe(134_940); expect(plan.pairsAfterBlocking).toBe(3_120); expect(blocked.proposals.some(({ status }) => status === "CONTRADICTED")).toBe(true);
    const directory = await mkdtemp(join(tmpdir(), "recoveria-drive-scale-")); const store = new LocalFileSourceCheckpointStore(directory); const key = { organizationId: source.organizationId, sourceType: source.sourceType, sourceId: source.sourceId } as const;
    await store.save(key, first.checkpoint); const loaded = await store.load(key); expect(loaded.status).toBe("FOUND"); if (loaded.status !== "FOUND") throw new Error("checkpoint missing");
    const uninterrupted = await processor.process(source, first.checkpoint); const reloaded = await processor.process(source, loaded.checkpoint);
    expect(reloaded).toEqual(uninterrupted); expect(reloaded.report.metrics).toMatchObject({ documentsDiscovered: 520, documentsUnderstood: 0, documentsReused: 520 }); expect(provider.documents).toBe(520);
  }, 30_000);
});
