import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import type { ProductSurfaceCheckpointReader } from "./read-model";
import { assertProductSurfaceBoundary } from "./read-model";
import type { ProductSurfaceScope } from "./types";

const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;

export type ProductSurfaceDocumentPreviewResult =
  | { readonly status: 200; readonly bytes: Uint8Array; readonly displayName: string }
  | { readonly status: 404 | 415 | 422; readonly error: "NOT_FOUND" | "UNSUPPORTED_CONTENT" | "DOCUMENT_INTEGRITY_MISMATCH" };

export async function readCommittedPdfPreview(
  checkpoints: ProductSurfaceCheckpointReader,
  scope: ProductSurfaceScope,
  documentId: string,
  privateDocumentDirectory: string,
): Promise<ProductSurfaceDocumentPreviewResult> {
  const loaded = await checkpoints.load(scope);
  if (!loaded) return { status: 404, error: "NOT_FOUND" };
  assertProductSurfaceBoundary(scope, loaded);
  const entry = loaded.checkpoint.entries.find(({ source }) => source.sourceDocumentId === documentId);
  if (!entry) return { status: 404, error: "NOT_FOUND" };
  if (entry.source.mimeType !== "application/pdf") return { status: 415, error: "UNSUPPORTED_CONTENT" };

  const safeName = basename(entry.source.displayName);
  if (safeName !== entry.source.displayName) return { status: 422, error: "DOCUMENT_INTEGRITY_MISMATCH" };
  const directory = resolve(privateDocumentDirectory);
  const path = resolve(directory, safeName);
  if (!path.startsWith(`${directory}${sep}`)) return { status: 422, error: "DOCUMENT_INTEGRITY_MISMATCH" };

  let bytes: Uint8Array;
  try { bytes = await readFile(path); } catch { return { status: 404, error: "NOT_FOUND" }; }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PREVIEW_BYTES) return { status: 415, error: "UNSUPPORTED_CONTENT" };
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.byteLength - 32)));
  if (header !== "%PDF-" || !tail.includes("%%EOF")) return { status: 415, error: "UNSUPPORTED_CONTENT" };
  const fingerprint = createHash("sha256").update(bytes).digest("hex");
  if (fingerprint !== entry.source.fingerprintSha256) return { status: 422, error: "DOCUMENT_INTEGRITY_MISMATCH" };
  return { status: 200, bytes, displayName: safeName };
}
