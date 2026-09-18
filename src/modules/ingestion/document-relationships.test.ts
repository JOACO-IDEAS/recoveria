import { describe, expect, it } from "vitest";
import { proposeDocumentRelationships, type CohortDocument } from "./document-relationships";
import type { ObservedCandidate, StructuredDocumentUnderstanding } from "./types";

const unavailable = <T>(): ObservedCandidate<T> => ({ raw: null, normalized: null, status: "MISSING", confidence: "UNAVAILABLE", classification: "UNKNOWN", observationIds: [] });
const fact = <T>(raw: string, normalized: T, confidence: "HIGH" | "MEDIUM" = "HIGH"): ObservedCandidate<T> => ({ raw, normalized, status: "EXTRACTED", confidence, classification: "FACT", observationIds: ["o1"] });

function doc(overrides: Partial<StructuredDocumentUnderstanding> & { issueDate?: string }): CohortDocument {
  const understanding: StructuredDocumentUnderstanding = {
    providerId: "test", observations: [{ id: "o1", documentId: "d", page: 1, observationType: "TEXT", observedText: "x", region: { x: 0, y: 0, width: 1, height: 1 }, extractionMethod: "LOCAL_PDF_NATIVE", parserVersion: "test", confidence: "HIGH" }],
    documentType: unavailable(), pointOfSale: unavailable(), invoiceNumber: unavailable(),
    dates: overrides.issueDate ? [{ ...fact(overrides.issueDate, overrides.issueDate), semantic: "ISSUE_DATE" }] : [],
    fiscalAuthorizationId: unavailable(), issuerTaxId: unavailable(), customerTaxId: unavailable(),
    issuerName: unavailable(), customerName: unavailable(), issuerAddress: unavailable(), customerAddress: unavailable(),
    currency: unavailable(), subtotalCents: unavailable(), taxComponents: [], documentedNominalTotalCents: unavailable(),
    description: unavailable(), servicePeriodStart: unavailable(), servicePeriodEnd: unavailable(),
    quotationReference: unavailable(), installmentStage: unavailable(), relationshipCandidates: [],
    ...overrides,
  };
  return { documentId: (overrides as { documentId?: string }).documentId ?? "doc", understanding };
}

const withId = (id: string, cohortDoc: CohortDocument): CohortDocument => ({ ...cohortDoc, documentId: id });

describe("cross-document relationship engine — positive proposals", () => {
  it("proposes same-customer from a shared tax id", () => {
    const a = withId("a", doc({ customerTaxId: fact("30-70000000-1", "30700000001") }));
    const b = withId("b", doc({ customerTaxId: fact("30-70000000-1", "30700000001") }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    expect(proposals).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "POSSIBLE_SAME_CUSTOMER", status: "PROPOSED", confidence: "HIGH", classification: "INFERENCE", documentIds: ["a", "b"] })]));
  });

  it("proposes an installment relationship only when total and customer both match, never claiming completeness", () => {
    const a = withId("a", doc({ customerTaxId: fact("1", "1"), installmentStage: fact("CUOTA 1 DE 3", "CUOTA 1 DE 3") }));
    const b = withId("b", doc({ customerTaxId: fact("1", "1"), installmentStage: fact("CUOTA 2 DE 3", "CUOTA 2 DE 3") }));
    const { proposals, unmatchedSignals } = proposeDocumentRelationships([a, b]);
    expect(proposals).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "POSSIBLE_INSTALLMENT_OF", status: "PROPOSED", reviewRequired: true })]));
    // Installment signal must never be reported as though the cohort proves all 3 installments exist.
    expect(unmatchedSignals).toEqual([]);
  });

  it("proposes advance/balance relationships from complementary stage wording", () => {
    const a = withId("a", doc({ customerTaxId: fact("1", "1"), installmentStage: fact("ANTICIPO 40%", "ANTICIPO 40%") }));
    const b = withId("b", doc({ customerTaxId: fact("1", "1"), installmentStage: fact("SALDO", "SALDO") }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    expect(proposals).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "POSSIBLE_ADVANCE_FOR", documentIds: ["a", "b"] })]));
  });

  it("proposes a project group from a shared quotation reference", () => {
    const a = withId("a", doc({ customerTaxId: fact("1", "1"), quotationReference: fact("01/07/2026", "01/07/2026", "MEDIUM") }));
    const b = withId("b", doc({ customerTaxId: fact("1", "1"), quotationReference: fact("01/07/2026", "01/07/2026", "MEDIUM") }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    expect(proposals).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "POSSIBLE_PROJECT_GROUP" })]));
  });

  it("proposes a recurring-service relationship for a monthly-spaced, same-customer, similar-description pair — and never labels it a duplicate", () => {
    const description = "Trabajo de mantenimiento mensual ascensor edificio";
    const a = withId("a", doc({ customerTaxId: fact("1", "1"), description: fact(description, description), issueDate: "2026-06-15T00:00:00.000Z" }));
    const b = withId("b", doc({ customerTaxId: fact("1", "1"), description: fact(description, description), issueDate: "2026-07-15T00:00:00.000Z" }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    const recurring = proposals.find((p) => p.kind === "POSSIBLE_RECURRING_SERVICE");
    expect(recurring).toBeDefined();
    expect(proposals.every((p) => p.kind !== "POSSIBLE_SAME_SERIES" || p.documentIds.length === 2)).toBe(true);
  });
});

describe("cross-document relationship engine — abstention", () => {
  it("never proposes same-customer from a bare name match with no tax id and no address corroboration", () => {
    const a = withId("a", doc({ customerName: fact("Consorcio Propietarios", "CONSORCIO PROPIETARIOS", "MEDIUM") }));
    const b = withId("b", doc({ customerName: fact("Consorcio Propietarios", "CONSORCIO PROPIETARIOS", "MEDIUM") }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    expect(proposals.some((p) => p.kind === "POSSIBLE_SAME_CUSTOMER")).toBe(false);
  });

  it("flags — rather than merges — two documents with the same displayed name but a contradicting tax id", () => {
    const a = withId("a", doc({ customerName: fact("Consorcio X", "CONSORCIO X", "MEDIUM"), customerTaxId: fact("1", "1") }));
    const b = withId("b", doc({ customerName: fact("Consorcio X", "CONSORCIO X", "MEDIUM"), customerTaxId: fact("2", "2") }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    const contradiction = proposals.find((p) => p.status === "CONTRADICTED");
    expect(contradiction).toBeDefined();
    expect(contradiction!.contradictingSignals.length).toBeGreaterThan(0);
    expect(proposals.some((p) => p.status === "PROPOSED" && p.kind === "POSSIBLE_SAME_CUSTOMER")).toBe(false);
  });

  it("does not fabricate a same-amount, same-month pair into a relationship without any customer/identity corroboration", () => {
    const a = withId("a", doc({ documentedNominalTotalCents: fact("100.000", 10_000_000), issueDate: "2026-06-15T00:00:00.000Z" }));
    const b = withId("b", doc({ documentedNominalTotalCents: fact("100.000", 10_000_000), issueDate: "2026-07-15T00:00:00.000Z" }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    expect(proposals).toEqual([]);
  });

  it("keeps an installment signal with no cohort counterpart as an explicit unmatched signal, never a fabricated complete set", () => {
    const a = withId("a", doc({ customerTaxId: fact("1", "1"), installmentStage: fact("CUOTA 1 DE 3", "CUOTA 1 DE 3") }));
    const b = withId("b", doc({ customerTaxId: fact("1", "1") })); // no stage at all — unrelated document from the same customer
    const { proposals, unmatchedSignals } = proposeDocumentRelationships([a, b]);
    expect(proposals.some((p) => p.kind === "POSSIBLE_INSTALLMENT_OF")).toBe(false);
    expect(unmatchedSignals).toEqual(expect.arrayContaining([expect.objectContaining({ documentId: "a", signalKind: "POSSIBLE_INSTALLMENT_OF" })]));
  });

  it("preserves provenance (evidence + source document ids) on every relationship proposal", () => {
    const a = withId("a", doc({ customerTaxId: fact("1", "1") }));
    const b = withId("b", doc({ customerTaxId: fact("1", "1") }));
    const { proposals } = proposeDocumentRelationships([a, b]);
    expect(proposals[0]!.evidence.length).toBeGreaterThan(0);
    expect(proposals[0]!.documentIds).toEqual(["a", "b"]);
  });
});
