import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readProviderBackedPreview } from "./provider-preview";

const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic\n%%EOF");
const document = { organizationId: "org", connectionId: "connection", documentId: "doc", providerDocumentId: "opaque-provider-doc", providerRootReference: "server-only-root", displayName: "invoice.pdf", mimeType: "application/pdf", fingerprintSha256: createHash("sha256").update(bytes).digest("hex"), providerContentIdentity: "identity" };
describe("provider preview", () => {
  it("authorizes tenant, root, type, size and committed identities", async () => { const read = vi.fn(async () => ({ bytes, mimeType: "application/pdf", rootMember: true, providerContentIdentity: "identity" })); const audit = { record: vi.fn(async () => undefined) }; const result = await readProviderBackedPreview({ organizationId: "org", actorId: "founder" }, "doc", { find: async () => document }, { read }, audit); expect(result.status).toBe(200); expect(read).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 10_000, maximumBytes: 25 * 1024 * 1024 })); expect(result).not.toHaveProperty("providerRootReference"); });
  it("never calls provider across tenants", async () => { const read = vi.fn(); const result = await readProviderBackedPreview({ organizationId: "other", actorId: "founder" }, "doc", { find: async () => null }, { read }, { record: async () => undefined }); expect(result.status).toBe(404); expect(read).not.toHaveBeenCalled(); });
  it("rejects identity drift", async () => { const result = await readProviderBackedPreview({ organizationId: "org", actorId: "founder" }, "doc", { find: async () => document }, { read: async () => ({ bytes, mimeType: "application/pdf", rootMember: true, providerContentIdentity: "changed" }) }, { record: async () => undefined }); expect(result).toEqual({ status: 422, error: "DOCUMENT_INTEGRITY_MISMATCH" }); });
});
