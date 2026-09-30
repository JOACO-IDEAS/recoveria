import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SourceCheckpoint } from "@/modules/ingestion/incremental-corpus-processor";
import type { VersionedSourceCheckpoint } from "@/modules/ingestion/production-source-checkpoint-port";
import { readCommittedPdfPreview } from "./document-preview";
import type { ProductSurfaceCheckpointReader } from "./read-model";
import type { ProductSurfaceScope } from "./types";

const scope: ProductSurfaceScope = { organizationId: "tenant-a", sourceType: "GOOGLE_DRIVE", sourceId: "source-a", connectionId: "connection-a" };
const pdf = new TextEncoder().encode("%PDF-1.4\nsynthetic preview\n%%EOF");

function record(overrides: { mimeType?: string; displayName?: string; fingerprint?: string; organizationId?: string } = {}): VersionedSourceCheckpoint {
  const documentId = "document-a";
  const checkpoint = {
    schemaVersion: 1, organizationId: overrides.organizationId ?? scope.organizationId, sourceType: scope.sourceType, sourceId: scope.sourceId, revision: "revision-1",
    entries: [{ source: { sourceDocumentId: documentId, displayName: overrides.displayName ?? "invoice-a.pdf", mimeType: overrides.mimeType ?? "application/pdf", size: pdf.byteLength, fingerprintSha256: overrides.fingerprint ?? createHash("sha256").update(pdf).digest("hex"), supported: true, provenance: { sourceType: scope.sourceType, sourceId: scope.sourceId, sourceDocumentId: documentId, locator: "private/invoice-a.pdf" } }, parse: { documentId, organizationId: scope.organizationId, classification: { format: "PDF_NATIVE", evidence: [] }, status: "PARSED", candidates: [], reviewReasons: [] }, processingOutcome: "SUCCEEDED", processingVersion: "v1", lastObservedRevision: "revision-1" }],
  } as SourceCheckpoint;
  return { version: 1, connectionId: scope.connectionId, checkpoint };
}

class Reader implements ProductSurfaceCheckpointReader { constructor(private readonly value: VersionedSourceCheckpoint | null) {} async load() { return this.value; } }

describe("committed Product Surface document preview", () => {
  it("serves only the exact PDF whose bytes match the committed document fingerprint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recoveria-preview-")); await writeFile(join(directory, "invoice-a.pdf"), pdf);
    const result = await readCommittedPdfPreview(new Reader(record()), scope, "document-a", directory);
    expect(result).toMatchObject({ status: 200, displayName: "invoice-a.pdf" });
    if (result.status === 200) expect([...result.bytes]).toEqual([...pdf]);
  });

  it("rejects another tenant, missing documents, unsupported content, traversal and byte mismatches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recoveria-preview-")); await writeFile(join(directory, "invoice-a.pdf"), pdf);
    await expect(readCommittedPdfPreview(new Reader(record({ organizationId: "tenant-b" })), scope, "document-a", directory)).rejects.toThrow("PRODUCT_SURFACE_SCOPE_MISMATCH");
    await expect(readCommittedPdfPreview(new Reader(record()), scope, "missing", directory)).resolves.toEqual({ status: 404, error: "NOT_FOUND" });
    await expect(readCommittedPdfPreview(new Reader(record({ mimeType: "text/plain" })), scope, "document-a", directory)).resolves.toEqual({ status: 415, error: "UNSUPPORTED_CONTENT" });
    await expect(readCommittedPdfPreview(new Reader(record({ displayName: "../invoice-a.pdf" })), scope, "document-a", directory)).resolves.toEqual({ status: 422, error: "DOCUMENT_INTEGRITY_MISMATCH" });
    await expect(readCommittedPdfPreview(new Reader(record({ fingerprint: "0".repeat(64) })), scope, "document-a", directory)).resolves.toEqual({ status: 422, error: "DOCUMENT_INTEGRITY_MISMATCH" });
  });
});
