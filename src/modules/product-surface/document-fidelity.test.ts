import { describe, expect, it } from "vitest";
import { IncrementalCorpusProcessor } from "@/modules/ingestion/incremental-corpus-processor";
import { DeterministicDocumentUnderstandingProvider } from "@/modules/ingestion/document-understanding-provider";
import type { DocumentSource } from "@/modules/ingestion/document-source";
import { buildSyntheticDrivePilotCorpus } from "@/test/fixtures/google-drive-synthetic-pilot-corpus";
import { ProductSurfaceQueryService, type ProductSurfaceCheckpointReader } from "./read-model";
import type { ProductSurfaceScope } from "./types";

const organizationId = "recoveria-synthetic-fidelity"; const sourceId = "source-fidelity"; const connectionId = "connection-fidelity";
const source: DocumentSource = {
  organizationId, sourceType: "GOOGLE_DRIVE", sourceId,
  async discover() { return buildSyntheticDrivePilotCorpus().slice(0, 5).map((file) => ({ sourceDocumentId: file.id, displayName: file.fileName, mimeType: "application/pdf", size: file.bytes.byteLength, modifiedAt: "2026-09-30T00:00:00.000Z", supported: true, provenance: { sourceType: "GOOGLE_DRIVE" as const, sourceId, sourceDocumentId: file.id, locator: `private/${file.fileName}` }, readContent: async () => file.bytes })); },
};

describe("synthetic pilot document fidelity", () => {
  it("carries the five customer names authored in the PDFs through extraction and Product Surface without fixture fallback", async () => {
    const run = await new IncrementalCorpusProcessor(new DeterministicDocumentUnderstandingProvider()).process(source);
    const reader: ProductSurfaceCheckpointReader = { async load() { return { version: 1, connectionId, checkpoint: run.checkpoint }; } };
    const scope: ProductSurfaceScope = { organizationId, sourceType: "GOOGLE_DRIVE", sourceId, connectionId };
    const invoices = await new ProductSurfaceQueryService(reader).listInvoices(scope);
    expect(invoices.map(({ source: item, entityCandidate }) => [item.displayName, entityCandidate.value, entityCandidate.classification])).toEqual([
      ["syn-a-0001-alfa.pdf", "Entidad Sintetica Alfa", "FACT"],
      ["syn-a-0002-beta.pdf", "Entidad Sintetica Beta", "FACT"],
      ["syn-a-0003-gamma.pdf", "Entidad Sintetica Gamma", "FACT"],
      ["syn-a-0004-delta.pdf", "Entidad Sintetica Delta", "FACT"],
      ["syn-a-0005-epsilon.pdf", "Entidad Sintetica Epsilon", "FACT"],
    ]);
    expect(JSON.stringify(invoices)).not.toContain("demoEntity");
    expect(JSON.stringify(invoices)).not.toMatch(/approvalRequired|manualApproval/i);
  });
});
