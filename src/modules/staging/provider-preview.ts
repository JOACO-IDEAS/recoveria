import { createHash } from "node:crypto";

const MAX_PREVIEW_BYTES = 25 * 1024 * 1024;
export interface PreviewPrincipal { readonly organizationId: string; readonly actorId: string }
export interface CommittedProviderDocument { readonly organizationId: string; readonly connectionId: string; readonly documentId: string; readonly providerDocumentId: string; readonly providerRootReference: string; readonly displayName: string; readonly mimeType: string; readonly fingerprintSha256: string; readonly providerContentIdentity?: string }
export interface PreviewDocumentRepository { find(organizationId: string, documentId: string): Promise<CommittedProviderDocument | null> }
export interface ProviderPreviewReader { read(input: { connectionId: string; providerDocumentId: string; expectedRootReference: string; timeoutMs: number; maximumBytes: number }): Promise<{ bytes: Uint8Array; mimeType: string; rootMember: boolean; providerContentIdentity?: string }> }
export interface PreviewAudit { record(event: { kind: "DOCUMENT_PREVIEW"; organizationId: string; actorId: string; documentId: string; outcome: "ALLOWED" | "REJECTED" }): Promise<void> }
export type ProviderPreviewResult = { status: 200; bytes: Uint8Array; displayName: string; headers: Record<string, string> } | { status: 404 | 415 | 422; error: "NOT_FOUND" | "UNSUPPORTED_CONTENT" | "DOCUMENT_INTEGRITY_MISMATCH" };

export async function readProviderBackedPreview(principal: PreviewPrincipal, documentId: string, documents: PreviewDocumentRepository, provider: ProviderPreviewReader, audit: PreviewAudit): Promise<ProviderPreviewResult> {
  const document = await documents.find(principal.organizationId, documentId);
  if (!document || document.organizationId !== principal.organizationId) { await audit.record({ kind: "DOCUMENT_PREVIEW", ...principal, documentId, outcome: "REJECTED" }); return { status: 404, error: "NOT_FOUND" }; }
  if (document.mimeType !== "application/pdf") return { status: 415, error: "UNSUPPORTED_CONTENT" };
  const loaded = await provider.read({ connectionId: document.connectionId, providerDocumentId: document.providerDocumentId, expectedRootReference: document.providerRootReference, timeoutMs: 10_000, maximumBytes: MAX_PREVIEW_BYTES });
  const bytes = loaded.bytes; const header = new TextDecoder("latin1").decode(bytes.subarray(0, 5)); const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.byteLength - 32)));
  if (!loaded.rootMember || loaded.mimeType !== "application/pdf" || !bytes.byteLength || bytes.byteLength > MAX_PREVIEW_BYTES || header !== "%PDF-" || !tail.includes("%%EOF")) return { status: 415, error: "UNSUPPORTED_CONTENT" };
  if (createHash("sha256").update(bytes).digest("hex") !== document.fingerprintSha256 || (document.providerContentIdentity && loaded.providerContentIdentity !== document.providerContentIdentity)) return { status: 422, error: "DOCUMENT_INTEGRITY_MISMATCH" };
  await audit.record({ kind: "DOCUMENT_PREVIEW", ...principal, documentId, outcome: "ALLOWED" });
  return { status: 200, bytes, displayName: document.displayName, headers: { "content-type": "application/pdf", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; frame-ancestors 'self'; sandbox" } };
}
