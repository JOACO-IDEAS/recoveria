import { describe, expect, it } from "vitest";
import { authorizeProductSurface, parseEvidenceField, parseInvoiceFilters } from "./server-boundary";

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
});
