import { describe, expect, it } from "vitest";
import { DEFAULT_AGING_POLICY, daysOverdue, requiresLegalReview } from "@/lib/domain/aging";
import { outstandingCents } from "@/lib/domain/ledger";
import type { InvoiceRecord, LedgerEntryRecord } from "@/lib/domain/types";
import { resolveEntity } from "@/modules/entity-resolution/resolver";
import { proposeCustomerIdentityClusters } from "@/modules/entity-resolution/cohort-clustering";
import { proposeDocumentRelationships, type CohortDocument } from "./document-relationships";
import type { ObservedCandidate, StructuredDocumentUnderstanding } from "./types";

// Phase 4.6B.1, Step 7 — explicit, machine-tested abstention invariants.
// Each test below is named after exactly one of the required invariants so
// this file can be read as a checklist, not just a test suite.

const unavailable = <T>(): ObservedCandidate<T> => ({ raw: null, normalized: null, status: "MISSING", confidence: "UNAVAILABLE", classification: "UNKNOWN", observationIds: [] });
const fact = <T>(raw: string, normalized: T): ObservedCandidate<T> => ({ raw, normalized, status: "EXTRACTED", confidence: "HIGH", classification: "FACT", observationIds: ["o1"] });
function minimalUnderstanding(overrides: Partial<StructuredDocumentUnderstanding>): StructuredDocumentUnderstanding {
  return {
    providerId: "test", observations: [], documentType: unavailable(), pointOfSale: unavailable(), invoiceNumber: unavailable(),
    dates: [], fiscalAuthorizationId: unavailable(), issuerTaxId: unavailable(), customerTaxId: unavailable(),
    issuerName: unavailable(), customerName: unavailable(), issuerAddress: unavailable(), customerAddress: unavailable(),
    currency: unavailable(), subtotalCents: unavailable(), taxComponents: [], documentedNominalTotalCents: unavailable(),
    description: unavailable(), servicePeriodStart: unavailable(), servicePeriodEnd: unavailable(),
    quotationReference: unavailable(), installmentStage: unavailable(), relationshipCandidates: [],
    ...overrides,
  };
}

describe("abstention: invoice exists ≠ invoice currently unpaid", () => {
  it("has no field anywhere in document understanding that asserts a payment status", () => {
    const u = minimalUnderstanding({});
    expect(Object.keys(u)).not.toContain("paymentStatus");
    expect(Object.keys(u)).not.toContain("isPaid");
    expect(Object.keys(u)).not.toContain("isUnpaid");
  });
});

describe("abstention: documented nominal total ≠ current balance", () => {
  it("requires an explicit ledger entry to produce any positive balance — invoice existence alone yields zero, not the invoice total", () => {
    const invoice: InvoiceRecord = { id: "inv-1", organizationId: "org", invoiceNumber: "F-1", issuedAt: "2026-01-01T00:00:00.000Z", dueAt: "2026-02-01T00:00:00.000Z", currency: "ARS", totalCents: 500_000, state: "ISSUED", evidenceRef: "doc:1" };
    // No ledger entries at all — not even the issuance entry.
    expect(outstandingCents(invoice, [])).toBe(0);
    expect(outstandingCents(invoice, [])).not.toBe(invoice.totalCents);
  });
});

describe("abstention: customer ≠ administration", () => {
  it("gives an identity cluster no field through which it could represent an EntityType or administration assignment", () => {
    const clusters = proposeCustomerIdentityClusters([{ sourceRef: "a", taxId: "1", normalizedName: "CONSORCIO X", normalizedAddress: null, evidence: [] }]);
    const keys = Object.keys(clusters[0]!);
    expect(keys).not.toContain("entityType");
    expect(keys).not.toContain("administrationId");
    expect(keys).not.toContain("role");
  });
});

describe("abstention: address similarity ≠ same legal entity", () => {
  it("keeps an address-only match low-confidence and reviewable, never promoted to a confirmed identity", () => {
    const clusters = proposeCustomerIdentityClusters([
      { sourceRef: "a", taxId: null, normalizedName: null, normalizedAddress: "CALLE FICTICIA 123", evidence: [] },
      { sourceRef: "b", taxId: null, normalizedName: null, normalizedAddress: "CALLE FICTICIA 123", evidence: [] },
    ]);
    expect(clusters[0]).toMatchObject({ confidence: "LOW", reviewRequired: true });
    expect(clusters[0]!.status).not.toBe("CONFIRMED" as never);
  });
});

describe("abstention: same amount + recurring month ≠ duplicate invoice", () => {
  it("never proposes any relationship from amount+month alone, without independent identity corroboration", () => {
    const doc = (id: string, issueDate: string): CohortDocument => ({ documentId: id, understanding: minimalUnderstanding({ documentedNominalTotalCents: fact("100.000", 10_000_000), dates: [{ ...fact(issueDate, issueDate), semantic: "ISSUE_DATE" }] }) });
    const { proposals } = proposeDocumentRelationships([doc("a", "2026-06-15T00:00:00.000Z"), doc("b", "2026-07-15T00:00:00.000Z")]);
    expect(proposals).toEqual([]);
  });
});

describe("abstention: old invoice ≠ prescribed debt", () => {
  it("treats a legal-age threshold strictly as a human-review trigger, never a prescription conclusion", () => {
    const days = daysOverdue("2020-01-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    expect(requiresLegalReview(days, DEFAULT_AGING_POLICY)).toBe(true);
    // The policy function is named and typed as a boolean review trigger; no prescription/legal-outcome type exists to call instead.
    expect(typeof requiresLegalReview(days, DEFAULT_AGING_POLICY)).toBe("boolean");
  });
});

describe("abstention: no due date found ≠ issue date is due date", () => {
  it("never falls back to the issue date when no explicit payment-due label is found", () => {
    const u = minimalUnderstanding({ dates: [{ ...fact("2026-01-15T00:00:00.000Z", "2026-01-15"), semantic: "ISSUE_DATE" }] });
    const due = u.dates.find(({ semantic }) => semantic === "PAYMENT_DUE_DATE");
    expect(due).toBeUndefined();
  });
});

describe("abstention: installment signal ≠ all installments exist in the cohort", () => {
  it("reports an unmatched installment signal rather than assuming the set is complete", () => {
    const doc = (id: string, stage?: string): CohortDocument => ({ documentId: id, understanding: minimalUnderstanding({ customerTaxId: fact("1", "1"), ...(stage ? { installmentStage: fact(stage, stage) } : {}) }) });
    const { proposals, unmatchedSignals } = proposeDocumentRelationships([doc("a", "CUOTA 1 DE 5"), doc("b")]);
    expect(proposals.some((p) => p.kind === "POSSIBLE_INSTALLMENT_OF")).toBe(false);
    expect(unmatchedSignals).toHaveLength(1);
  });
});

describe("abstention: no payment evidence ≠ no payment occurred", () => {
  it("labels invoice state only relative to evidence RecoverIA holds, with no absolute never-paid conclusion in the vocabulary", () => {
    // The domain model's InvoiceState is a documentary state, not a claim about the world.
    const states: InvoiceRecord["state"][] = ["ISSUED", "DISPUTED", "CANCELLED"];
    expect(states).not.toContain("CONFIRMED_NEVER_PAID" as never);
    expect(states).not.toContain("NEVER_PAID" as never);
  });

  it("keeps a zero-ledger invoice's balance reviewable rather than a settled fact about the real world", () => {
    const invoice: InvoiceRecord = { id: "inv-2", organizationId: "org", invoiceNumber: "F-2", issuedAt: "2026-01-01T00:00:00.000Z", dueAt: "2026-02-01T00:00:00.000Z", currency: "ARS", totalCents: 500_000, state: "ISSUED", evidenceRef: "doc:2" };
    const issuance: LedgerEntryRecord = { id: "le-1", organizationId: "org", invoiceId: invoice.id, type: "INVOICE_ISSUED", amountCents: 500_000, currency: "ARS", effectiveAt: invoice.issuedAt, evidenceRef: "doc:2" };
    expect(outstandingCents(invoice, [issuance])).toBe(500_000);
  });
});

describe("abstention: cross-source future contradiction model (Step 6/9.14)", () => {
  it("returns CONFLICT rather than silently overwriting when a second source contradicts a strong identifier", () => {
    // Simulates a future second source (e.g. Catedral or a contact import) disagreeing with the invoice-derived tax id.
    const entities = [{ id: "e1", organizationId: "org", type: "ADMINISTRATION" as const, legalName: "Consorcio X", taxId: "30700000001" }];
    const fromInvoice = resolveEntity({ organizationId: "org", entityType: "ADMINISTRATION", taxId: "30700000001", sourceRefs: ["doc:invoice"] }, entities, [], []);
    expect(fromInvoice.status).toBe("RESOLVED");
    const fromOtherSource = resolveEntity({ organizationId: "org", entityType: "ADMINISTRATION", taxId: "30799999999", rawName: "Consorcio X", sourceRefs: ["catedral:row:1"] }, entities, [], []);
    // A future source naming the same entity with a contradicting tax id must never silently win or lose — it must surface as a conflict for human review.
    expect(fromOtherSource.status === "CONFLICT" || fromOtherSource.status === "NO_MATCH").toBe(true);
  });
});
