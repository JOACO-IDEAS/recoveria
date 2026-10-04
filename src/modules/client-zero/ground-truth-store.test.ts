import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyFieldLabel, emptyFieldLabel, initializeGroundTruth, mergeNewDocuments, readGroundTruth, writeGroundTruth } from "./ground-truth-store";
import { REVIEWABLE_FIELD_NAMES, type DocumentProposal } from "./ground-truth-types";

const syntheticProposal = (id: string): DocumentProposal => ({
  documentId: `source-${id}`,
  privateSafeDocumentId: id,
  importBatchId: "batch-synthetic",
  reviewReasons: [],
  pdfFileName: "synthetic.pdf",
  fields: Object.fromEntries(REVIEWABLE_FIELD_NAMES.map((name) => [name, { raw: "synthetic-value", normalized: "synthetic-value", sourceLocation: { kind: "PDF_TEXT" } }])) as DocumentProposal["fields"],
});

describe("ground truth store", () => {
  it("initializes every field to UNREVIEWED regardless of the proposal content", () => {
    const store = initializeGroundTruth([syntheticProposal("doc-01")]);
    expect(store["doc-01"].status).toBe("UNREVIEWED");
    expect(store["doc-01"].reviewer).toBeNull();
    for (const name of REVIEWABLE_FIELD_NAMES) expect(store["doc-01"].fields[name]).toEqual(emptyFieldLabel());
  });

  it("never derives a label from the pipeline's own proposed value", () => {
    const store = initializeGroundTruth([syntheticProposal("doc-01")]);
    expect(store["doc-01"].fields.invoiceNumber.status).toBe("UNREVIEWED");
    expect(store["doc-01"].fields.invoiceNumber.correctedValue).toBeNull();
  });

  it("merging new documents never touches an already-reviewed document", () => {
    const initial = initializeGroundTruth([syntheticProposal("doc-01")]);
    const reviewed = applyFieldLabel(initial, { documentId: "doc-01", fieldName: "invoiceNumber", status: "CORRECT", reviewer: "founder" }, () => "2026-01-01T00:00:00.000Z");
    const merged = mergeNewDocuments(reviewed, [syntheticProposal("doc-01"), syntheticProposal("doc-02")]);
    expect(merged["doc-01"]).toEqual(reviewed["doc-01"]);
    expect(merged["doc-02"].status).toBe("UNREVIEWED");
  });

  it("applyFieldLabel requires an explicit reviewer and status, and updates document status to IN_PROGRESS then COMPLETE", () => {
    let store = initializeGroundTruth([syntheticProposal("doc-01")]);
    store = applyFieldLabel(store, { documentId: "doc-01", fieldName: "invoiceNumber", status: "CORRECT", reviewer: "founder" }, () => "2026-01-01T00:00:00.000Z");
    expect(store["doc-01"].status).toBe("IN_PROGRESS");
    expect(store["doc-01"].reviewer).toBe("founder");
    expect(store["doc-01"].reviewedAt).toBe("2026-01-01T00:00:00.000Z");
    for (const name of REVIEWABLE_FIELD_NAMES.filter((n) => n !== "invoiceNumber")) {
      store = applyFieldLabel(store, { documentId: "doc-01", fieldName: name, status: "NOT_PRESENT_IN_DOCUMENT", reviewer: "founder" });
    }
    expect(store["doc-01"].status).toBe("COMPLETE");
  });

  it("applyFieldLabel preserves a corrected value only for the labeled field", () => {
    const initial = initializeGroundTruth([syntheticProposal("doc-01")]);
    const updated = applyFieldLabel(initial, { documentId: "doc-01", fieldName: "currency", status: "INCORRECT", correctedValue: "ARS", reviewer: "founder" });
    expect(updated["doc-01"].fields.currency).toEqual({ status: "INCORRECT", correctedValue: "ARS", note: null });
    expect(updated["doc-01"].fields.invoiceNumber).toEqual(emptyFieldLabel());
  });

  it("applyFieldLabel throws on an unknown document rather than silently creating one", () => {
    const store = initializeGroundTruth([syntheticProposal("doc-01")]);
    expect(() => applyFieldLabel(store, { documentId: "doc-99", fieldName: "currency", status: "CORRECT", reviewer: "founder" })).toThrow("GROUND_TRUTH_UNKNOWN_DOCUMENT");
  });

  describe("file persistence", () => {
    let dir: string;
    beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "gt-store-test-")); });
    afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

    it("round-trips through disk and is readable after a simulated restart", async () => {
      const filePath = path.join(dir, "ground-truth.json");
      const store = initializeGroundTruth([syntheticProposal("doc-01")]);
      await writeGroundTruth(filePath, store);
      const reloaded = await readGroundTruth(filePath);
      expect(reloaded).toEqual(store);
    });

    it("returns null for a missing file rather than throwing", async () => {
      expect(await readGroundTruth(path.join(dir, "missing.json"))).toBeNull();
    });
  });
});
