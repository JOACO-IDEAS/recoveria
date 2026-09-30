import { describe, expect, it } from "vitest";
import { DeterministicDocumentUnderstandingProvider } from "./document-understanding-provider";
import { FakeGoogleDriveClient, type FakeDriveRecord } from "./fake-google-drive-client";
import { DRIVE_MAX_PAGES, DriveSourceFetchError, GoogleDriveSource, mapGoogleDriveFailure, toSanitizedDriveCorpusReport, type DriveConnection, type DriveFilePage, type GoogleDriveClientPort } from "./google-drive-source-contract";
import { IncrementalCorpusProcessor } from "./incremental-corpus-processor";
import { proposeDocumentRelationships, type CohortDocument } from "./document-relationships";
import { buildRelationshipCandidatePlan } from "./relationship-blocking";

function pdf(number: number, customer: number, taxIdentity = customer): Uint8Array {
  const lines = ["FACTURA B", `Nro: 0007-${String(number).padStart(8, "0")}`, "Fecha: 15/07/2026", "CUIT: 30-70000000-1", `Razon Social: Consorcio ${customer}`, `CUIT: 30-${String(80_000_000 + taxIdentity).padStart(8, "0")}-1`, `Domicilio: Calle ${customer}`, "Moneda: Peso", "Servicio documentado", "TOTAL 100000.00"];
  const commands = lines.map((line, index) => `BT /F1 10 Tf 40 ${800 - index * 22} Td (${line}) Tj ET`).join("\n"); const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let value = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((body, index) => { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${body}\nendobj\n`; }); const xref = Buffer.byteLength(value); value += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return new TextEncoder().encode(value);
}
const connection: DriveConnection = { organizationId: "org-a", connectionId: "connection-a", googleSubject: "subject-a", authorizedRootId: "root-a", authorizationState: "AUTHORIZED" };
const record = (id: string, bytes = pdf(1, 1), overrides: Partial<FakeDriveRecord> = {}): FakeDriveRecord => ({ fileId: id, displayName: `${id}.pdf`, locator: `root-a/${id}.pdf`, mimeType: "application/pdf", size: bytes.length, modifiedAt: "2026-09-20T00:00:00.000Z", kind: "FILE", corpusRootId: "root-a", bytes, ...overrides });
const pagingClient = (page: (token?: string) => DriveFilePage): GoogleDriveClientPort => ({ listFiles: async ({ pageToken }) => page(pageToken), getMetadata: async () => { throw new Error("unused"); }, readPdfContent: async () => new Uint8Array(), getStartPageToken: async () => "cursor", listChanges: async () => ({ changes: [], newStartPageToken: "cursor" }) });

describe("production-shaped offline GoogleDriveSource", () => {
  it("discovers deterministic pages, preserves IDs, and never reads unsupported or shortcut content", async () => {
    const client = new FakeGoogleDriveClient(); client.pageSize = 2; client.put(record("b")); client.put(record("a")); client.put(record("non-pdf", new Uint8Array(), { mimeType: "text/plain", displayName: "notes.txt" })); client.put(record("shortcut", new Uint8Array(), { kind: "SHORTCUT", mimeType: "application/vnd.google-apps.shortcut", shortcutTargetId: "outside" }));
    const documents = await new GoogleDriveSource(connection, client).discover(); expect(documents.map(({ sourceDocumentId }) => sourceDocumentId)).toEqual(["a", "b", "non-pdf", "shortcut"]);
    await Promise.all(documents.map((document) => document.readContent())); expect(client.reads).toEqual(new Map([["a", 1], ["b", 1]])); expect(documents.filter(({ supported }) => !supported)).toHaveLength(2);
  });

  it("rejects records outside the authorized root and inactive authorization", async () => {
    const client = new FakeGoogleDriveClient(); client.put(record("outside", pdf(1, 1), { corpusRootId: "root-b" })); client.leakOutsideBoundary = true;
    await expect(new GoogleDriveSource(connection, client).discover()).rejects.toMatchObject({ code: "DRIVE_CORPUS_BOUNDARY_VIOLATION", retryable: false });
    expect(() => new GoogleDriveSource({ ...connection, authorizationState: "REVOKED" }, client)).toThrow("DRIVE_AUTHORIZATION_INACTIVE");
  });

  it("does not fabricate a complete corpus when a later discovery page fails", async () => {
    const client = new FakeGoogleDriveClient(); client.pageSize = 1; client.put(record("a")); client.put(record("b")); client.failOnCall("LIST", 2, new DriveSourceFetchError("DRIVE_SERVER_FAILURE", "RETRYABLE"));
    const run = await new IncrementalCorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(new GoogleDriveSource(connection, client));
    expect(run.report.documents).toHaveLength(0); expect(run.report.failures).toEqual([expect.objectContaining({ kind: "DISCOVERY_FAILURE", code: "DRIVE_SERVER_FAILURE", retryable: true })]);
  });

  it("fails closed on repeated and cyclical file page tokens", async () => {
    const repeated = new GoogleDriveSource(connection, pagingClient((token) => ({ files: [], nextPageToken: token ?? "1" })));
    await expect(repeated.discover()).rejects.toMatchObject({ code: "DRIVE_PAGINATION_TOKEN_CYCLE" });
    const cycle = new GoogleDriveSource(connection, pagingClient((token) => ({ files: [], nextPageToken: token === undefined ? "1" : token === "1" ? "2" : "1" })));
    await expect(cycle.discover()).rejects.toMatchObject({ code: "DRIVE_PAGINATION_TOKEN_CYCLE" });
  });

  it("accepts long valid pagination and enforces the generous hard page guard", async () => {
    let validCalls = 0; const valid = new GoogleDriveSource(connection, pagingClient(() => ({ files: [], ...(++validCalls < 1_200 ? { nextPageToken: String(validCalls) } : {}) })));
    await expect(valid.discover()).resolves.toEqual([]); expect(validCalls).toBe(1_200);
    let guardedCalls = 0; const guarded = new GoogleDriveSource(connection, pagingClient(() => ({ files: [], nextPageToken: String(++guardedCalls) })));
    await expect(guarded.discover()).rejects.toMatchObject({ code: "DRIVE_PAGINATION_LIMIT_EXCEEDED" }); expect(guardedCalls).toBe(DRIVE_MAX_PAGES);
  });

  it("maps Drive failure classes without internal retries", () => {
    expect(mapGoogleDriveFailure({ status: 429 }).kind).toBe("RETRYABLE"); expect(mapGoogleDriveFailure({ status: 403, reason: "quotaExceeded" }).kind).toBe("RETRYABLE"); expect(mapGoogleDriveFailure({ status: 503 }).kind).toBe("RETRYABLE"); expect(mapGoogleDriveFailure({ network: "TIMEOUT" }).kind).toBe("RETRYABLE");
    expect(mapGoogleDriveFailure({ status: 401 }).kind).toBe("AUTHORIZATION"); expect(mapGoogleDriveFailure({ status: 403, reason: "PERMISSION_LOSS" }).kind).toBe("AUTHORIZATION"); expect(mapGoogleDriveFailure({ status: 404 }).kind).toBe("TERMINAL"); expect(mapGoogleDriveFailure({ status: 400 }).kind).toBe("TERMINAL");
  });

  it("lets the fake client simulate every required failure class without hidden retry", async () => {
    const cases = [mapGoogleDriveFailure({ status: 429 }), mapGoogleDriveFailure({ status: 403, reason: "quotaExceeded" }), mapGoogleDriveFailure({ status: 401 }), mapGoogleDriveFailure({ status: 404 }), mapGoogleDriveFailure({ status: 503 }), mapGoogleDriveFailure({ network: "TIMEOUT" }), mapGoogleDriveFailure({ reason: "REVOKED_CONSENT" })];
    for (const error of cases) { const client = new FakeGoogleDriveClient(); client.failNext("LIST", error); const run = await new IncrementalCorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(new GoogleDriveSource(connection, client)); expect(run.report.failures).toEqual([expect.objectContaining({ code: error.code, retryable: error.retryable })]); }
  });

  it("paginates changes, makes removals explicit, and degrades invalid tokens", async () => {
    const client = new FakeGoogleDriveClient(); client.changePageSize = 1; client.put(record("a")); const source = new GoogleDriveSource(connection, client); const cursor = await source.currentCursor(); client.put(record("b")); client.trash("a"); const changes = await source.discoverChanges(cursor);
    expect(changes.status).toBe("VALID"); expect(changes.changedDocuments.map(({ sourceDocumentId }) => sourceDocumentId)).toEqual(["b"]); expect(changes.removedSourceDocumentIds).toEqual(["a"]); expect(changes.nextCursor?.value).toBe("token-3");
    client.invalidateToken(changes.nextCursor!.value, "EXPIRED"); expect((await source.discoverChanges(changes.nextCursor!)).status).toBe("EXPIRED");
  });

  it("fails closed on a repeated change page token", async () => { const client = new FakeGoogleDriveClient(); client.put(record("a")); const source = new GoogleDriveSource(connection, client); const cursor = await source.currentCursor(); client.changeNextTokens.set(cursor.value, cursor.value); await expect(source.discoverChanges(cursor)).rejects.toMatchObject({ code: "DRIVE_CHANGE_PAGINATION_TOKEN_CYCLE" }); });

  it("binds cursors to root and shared-drive namespaces before change access", async () => {
    const client = new FakeGoogleDriveClient(); client.put(record("a")); const source = new GoogleDriveSource(connection, client); const cursor = await source.currentCursor(); await expect(source.discoverChanges(cursor)).resolves.toMatchObject({ status: "VALID" });
    const otherRoot = new GoogleDriveSource({ ...connection, authorizedRootId: "root-b" }, client); await expect(otherRoot.discoverChanges(cursor)).rejects.toThrow("SOURCE_CURSOR_BOUNDARY_MISMATCH");
    const shared = new GoogleDriveSource({ ...connection, sharedDriveId: "shared-a" }, client); await expect(shared.discoverChanges(cursor)).rejects.toThrow("SOURCE_CURSOR_BOUNDARY_MISMATCH");
    await expect(source.discoverChanges({ organizationId: cursor.organizationId, sourceType: cursor.sourceType, sourceId: cursor.sourceId, value: cursor.value })).rejects.toThrow("SOURCE_CURSOR_BOUNDARY_MISMATCH");
    expect(client.operationCalls.get("CHANGES")).toBe(1);
  });

  it("runs the real pipeline across unchanged and churned corpora", async () => {
    const client = new FakeGoogleDriveClient(); client.put(record("a", pdf(1, 1))); client.put(record("b", pdf(2, 2))); const source = new GoogleDriveSource(connection, client); const processor = new IncrementalCorpusProcessor(new DeterministicDocumentUnderstandingProvider());
    const first = await processor.process(source); expect(first.report.metrics).toMatchObject({ documentsDiscovered: 2, documentsUnderstood: 2, documentsReused: 0 });
    const second = await processor.process(source, first.checkpoint); expect(second.report.metrics).toMatchObject({ documentsUnderstood: 0, documentsReused: 2 });
    client.put(record("a", pdf(1, 1), { locator: "root-a/moved/renamed.pdf", displayName: "renamed.pdf" })); client.put(record("b", pdf(22, 2))); client.put(record("c", pdf(3, 3))); const third = await processor.process(source, second.checkpoint);
    expect(third.report.metrics).toMatchObject({ documentsUnderstood: 2, documentsReused: 1 }); expect(third.report.changes).toEqual(expect.arrayContaining([expect.objectContaining({ sourceDocumentId: "a", kind: "LOCATOR_CHANGED" }), expect.objectContaining({ sourceDocumentId: "b", kind: "CONTENT_CHANGED" }), expect.objectContaining({ sourceDocumentId: "c", kind: "NEW" })]));
    client.remove("b"); const fourth = await processor.process(source, third.checkpoint); expect(fourth.report.changes).toContainEqual(expect.objectContaining({ sourceDocumentId: "b", kind: "REMOVED" })); expect(fourth.report.documents.map(({ source: item }) => item.sourceDocumentId)).not.toContain("b");
    expect(toSanitizedDriveCorpusReport(fourth.report)).toEqual(expect.objectContaining({ filesDiscovered: 2, reusedFiles: 2, understoodFiles: 0, invoicesUnderstood: 2, processingStatus: "COMPLETE" }));
  });

  it("preserves partial failures with sanitized error codes", async () => {
    const client = new FakeGoogleDriveClient(); client.put(record("a")); client.failNext("READ", new DriveSourceFetchError("DRIVE_RATE_LIMITED", "RETRYABLE")); const run = await new IncrementalCorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(new GoogleDriveSource(connection, client));
    expect(run.report.failures).toEqual([expect.objectContaining({ code: "DRIVE_RATE_LIMITED", retryable: true })]); expect(run.checkpoint.cursor).toBeUndefined(); expect(toSanitizedDriveCorpusReport(run.report).processingStatus).toBe("FAILED");
  });

  it("processes a realistic 510-record corpus with exact blocked/exhaustive semantics", async () => {
    const client = new FakeGoogleDriveClient(); client.pageSize = 43; for (let index = 0; index < 510; index++) { const customer = index % 45; client.put(record(`file-${String(index).padStart(4, "0")}`, pdf(10_000 + index, customer, index % 29 === 0 ? customer + 1_000 : customer), { locator: `root-a/batch-${Math.floor(index / 43)}/${index}.pdf` })); }
    const source = new GoogleDriveSource(connection, client); const processor = new IncrementalCorpusProcessor(new DeterministicDocumentUnderstandingProvider()); const first = await processor.process(source); const second = await processor.process(source, first.checkpoint);
    const cohort: CohortDocument[] = first.report.documents.flatMap(({ source: item, parse }) => parse.understanding ? [{ documentId: item.sourceDocumentId, understanding: parse.understanding }] : []); const plan = buildRelationshipCandidatePlan(cohort); const blocked = proposeDocumentRelationships(cohort, plan.pairs); expect(blocked).toEqual(proposeDocumentRelationships(cohort));
    expect(first.report.metrics).toMatchObject({ documentsDiscovered: 510, documentsUnderstood: 510, documentsReused: 0, documentsFailed: 0, candidatePairsBeforeBlocking: 129_795 }); expect(plan.pairsAfterBlocking).toBe(2_640); expect(blocked.proposals.some(({ status }) => status === "CONTRADICTED")).toBe(true); expect(second.report.metrics).toMatchObject({ documentsUnderstood: 0, documentsReused: 510 });
    client.put(record("file-0000", pdf(10_000, 0, 1_000), { locator: "root-a/moved/file-0000.pdf" })); client.put(record("file-0001", pdf(99_001, 1))); client.remove("file-0002"); client.trash("file-0003"); client.put(record("file-0510", pdf(10_510, 15)));
    const churn = await processor.process(source, second.checkpoint); expect(churn.report.metrics).toMatchObject({ documentsDiscovered: 509, documentsUnderstood: 2, documentsReused: 507, documentsFailed: 0 });
    expect(churn.report.changes.filter(({ kind }) => kind === "CONTENT_CHANGED")).toHaveLength(1); expect(churn.report.changes.filter(({ kind }) => kind === "NEW")).toHaveLength(1); expect(churn.report.changes.filter(({ kind }) => kind === "REMOVED")).toHaveLength(2); expect(churn.report.changes.filter(({ kind }) => kind === "LOCATOR_CHANGED")).toHaveLength(1);
  }, 30_000);
});
