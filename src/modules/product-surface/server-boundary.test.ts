import { describe, expect, it, vi } from "vitest";
import { authorizeProductSurface, configuredProductSurfaceScope, parseEvidenceField, parseInvoiceFilters, productSurfaceDocumentResponse, productSurfacePdfResponse } from "./server-boundary";

describe("Product Surface server boundary", () => {
  it("fails closed without the exact server token", () => {
    const token = "a".repeat(40);
    expect(authorizeProductSurface(new Request("http://localhost"), token)).toBe(false);
    expect(authorizeProductSurface(new Request("http://localhost", { headers: { authorization: `Bearer ${"b".repeat(40)}` } }), token)).toBe(false);
    expect(authorizeProductSurface(new Request("http://localhost", { headers: { authorization: `Bearer ${token}` } }), token)).toBe(true);
  });

  it("allow-lists documentary filters and rejects debt or unknown filters", () => {
    expect(parseInvoiceFilters(new URL("http://localhost?search=demo&confidence=HIGH&reviewRequired=true"))).toEqual({ search: "demo", confidence: "HIGH", reviewRequired: true });
    expect(parseInvoiceFilters(new URL("http://localhost?paid=false"))).toBeNull();
    expect(parseInvoiceFilters(new URL("http://localhost?documentedNominalTotalCentsMin=-1"))).toBeNull();
  });

  it("allow-lists evidence fields", () => {
    expect(parseEvidenceField("documentedNominalTotalCents")).toBe("documentedNominalTotalCents");
    expect(parseEvidenceField("outstandingCents")).toBeNull();
  });

  it("resolves documentary scope from the tenant's authoritative connected source", async () => {
    const previous = process.env.RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID;
    process.env.RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID = "tenant-a";
    const findFirst = vi.fn(async () => ({ organizationId: "tenant-a", providerConnectionId: "connection-a" }));
    await expect(configuredProductSurfaceScope({ connectedSource: { findFirst } } as never)).resolves.toEqual({ organizationId: "tenant-a", sourceType: "GOOGLE_DRIVE", sourceId: "connection-a", connectionId: "connection-a" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "tenant-a", provider: "GOOGLE_DRIVE" }) }));
    if (previous === undefined) delete process.env.RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID; else process.env.RECOVERIA_PRODUCT_SURFACE_ORGANIZATION_ID = previous;
  });

  it("rejects document preview before resolving any private document", async () => {
    const response = await productSurfaceDocumentResponse(new Request("http://localhost/api/product-surface/invoices/document-a/preview"), "document-a");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("serves a private inline PDF without exposing a public source URL", async () => {
    const response = productSurfacePdfResponse(new TextEncoder().encode("%PDF-1.4\n%%EOF"), "invoice-a.pdf");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("content-disposition")).toContain("invoice-a.pdf");
    expect(JSON.stringify([...response.headers])).not.toMatch(/drive\.google|rootId|sourceId|token/i);
  });
});
