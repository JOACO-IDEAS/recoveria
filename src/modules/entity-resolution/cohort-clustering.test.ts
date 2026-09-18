import { describe, expect, it } from "vitest";
import { proposeCustomerIdentityClusters, type CustomerIdentitySignal } from "./cohort-clustering";

const signal = (sourceRef: string, overrides: Partial<CustomerIdentitySignal> = {}): CustomerIdentitySignal => ({
  sourceRef, taxId: null, normalizedName: null, normalizedAddress: null, evidence: [{ documentId: sourceRef, location: { kind: "PDF_TEXT" }, rawValue: "x" }],
  ...overrides,
});

describe("cohort customer-identity clustering", () => {
  it("clusters recurring documents by shared tax id with high confidence", () => {
    const clusters = proposeCustomerIdentityClusters([signal("a", { taxId: "1" }), signal("b", { taxId: "1" }), signal("c", { taxId: "2" })]);
    const clusterOne = clusters.find((c) => c.taxId === "1");
    expect(clusterOne).toMatchObject({ status: "PROPOSED", confidence: "HIGH" });
    expect([...clusterOne!.memberSourceRefs].sort()).toEqual(["a", "b"]);
  });

  it("flags a conflicting tax identity instead of merging same-name-and-address records", () => {
    const clusters = proposeCustomerIdentityClusters([
      signal("a", { taxId: "1", normalizedName: "CONSORCIO X", normalizedAddress: "CALLE FICTICIA 123" }),
      signal("b", { taxId: "2", normalizedName: "CONSORCIO X", normalizedAddress: "CALLE FICTICIA 123" }),
    ]);
    expect(clusters.every((c) => c.status === "CONTRADICTED")).toBe(true);
    expect(clusters).toHaveLength(2); // never merged into one cluster
    expect(clusters.flatMap((c) => c.contradictingSignals).length).toBeGreaterThan(0);
  });

  it("never merges two distinct tax ids that merely share a generic displayed name without an address match", () => {
    const clusters = proposeCustomerIdentityClusters([
      signal("a", { taxId: "1", normalizedName: "CONSORCIO PROPIETARIOS" }),
      signal("b", { taxId: "2", normalizedName: "CONSORCIO PROPIETARIOS" }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.status === "PROPOSED")).toBe(true); // each stands on its own tax-id evidence
  });

  it("treats an address-only match, with no tax id, as low-confidence and always reviewable", () => {
    const clusters = proposeCustomerIdentityClusters([signal("a", { normalizedAddress: "CALLE FICTICIA 123" }), signal("b", { normalizedAddress: "CALLE FICTICIA 123" })]);
    const cluster = clusters.find((c) => c.memberSourceRefs.includes("a"));
    expect(cluster).toMatchObject({ status: "PROPOSED", confidence: "LOW", reviewRequired: true, taxId: null });
  });

  it("marks an address that matches more than one tax-id cluster as ambiguous rather than guessing", () => {
    const clusters = proposeCustomerIdentityClusters([
      signal("a", { taxId: "1", normalizedAddress: "CALLE FICTICIA 123" }),
      signal("b", { taxId: "2", normalizedAddress: "CALLE FICTICIA 123" }),
      signal("c", { normalizedAddress: "CALLE FICTICIA 123" }), // no tax id — which of the two is it?
    ]);
    const ambiguous = clusters.find((c) => c.memberSourceRefs.includes("c"));
    expect(ambiguous?.status).toBe("AMBIGUOUS");
  });

  it("never clusters a bare generic name with no tax id and no address — abstains as UNKNOWN", () => {
    const clusters = proposeCustomerIdentityClusters([signal("a", { normalizedName: "PROPIETARIO" }), signal("b", { normalizedName: "PROPIETARIO" })]);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.status === "UNKNOWN")).toBe(true);
  });

  it("never exposes any field capable of representing an EntityType or administration assignment", () => {
    const clusters = proposeCustomerIdentityClusters([signal("a", { taxId: "1" })]);
    const keys = Object.keys(clusters[0]!);
    expect(keys).not.toContain("entityType");
    expect(keys).not.toContain("administrationId");
  });

  it("keeps provenance on every cluster", () => {
    const clusters = proposeCustomerIdentityClusters([signal("a", { taxId: "1" }), signal("b", { taxId: "1" })]);
    expect(clusters[0]!.evidence.length).toBeGreaterThan(0);
  });
});
