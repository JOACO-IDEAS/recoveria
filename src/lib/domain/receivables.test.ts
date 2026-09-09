import { describe, expect, it } from "vitest";
import { agingBucket, daysOverdue, DEFAULT_AGING_POLICY, requiresLegalReview } from "./aging";
import { appendCorrection } from "./evidence";
import { outstandingCents } from "./ledger";
import { computePortfolio } from "./portfolio";
import { requireTenantRecord, tenantRecords, TenantAccessError } from "./tenant-scope";
import { SYNTHETIC_AS_OF, SYNTHETIC_TRUTH_SET } from "@/test/fixtures/synthetic-truth-set";

const invoice = (id: string) => {
  const result = SYNTHETIC_TRUTH_SET.invoices.find((item) => item.id === id);
  if (!result) throw new Error(`Missing fixture invoice ${id}`);
  return result;
};

describe("synthetic truth set", () => {
  it("has the approved compact Client Zero shape", () => {
    expect(SYNTHETIC_TRUTH_SET.parties).toHaveLength(7);
    expect(SYNTHETIC_TRUTH_SET.buildings).toHaveLength(12);
    expect(SYNTHETIC_TRUTH_SET.invoices).toHaveLength(30);
    expect(SYNTHETIC_TRUTH_SET.contacts).toHaveLength(4);
    expect(new Set(SYNTHETIC_TRUTH_SET.invoices.map(({ currency }) => currency))).toEqual(new Set(["ARS"]));
  });

  it("is deeply immutable", () => {
    expect(Object.isFrozen(SYNTHETIC_TRUTH_SET)).toBe(true);
    expect(Object.isFrozen(SYNTHETIC_TRUTH_SET.invoices)).toBe(true);
    expect(Object.isFrozen(SYNTHETIC_TRUTH_SET.invoices[0])).toBe(true);
  });
});

describe("financial ledger", () => {
  it("derives a fully paid invoice balance as zero", () => {
    expect(outstandingCents(invoice("i01"), SYNTHETIC_TRUTH_SET.ledgerEntries)).toBe(0);
  });

  it("derives a partial payment without mutating invoice total", () => {
    expect(invoice("i10").totalCents).toBe(50_000_000);
    expect(outstandingCents(invoice("i10"), SYNTHETIC_TRUTH_SET.ledgerEntries)).toBe(30_000_000);
  });

  it("rejects cross-tenant ledger evidence", () => {
    const foreign = { ...SYNTHETIC_TRUTH_SET.ledgerEntries[0], organizationId: "other-tenant" };
    expect(() => outstandingCents(invoice("i01"), [foreign])).toThrow("Cross-tenant ledger entry rejected");
  });
});

describe("aging policy", () => {
  it.each([
    [0, "CURRENT"], [1, "1-30"], [30, "1-30"], [31, "31-60"], [60, "31-60"],
    [61, "61-90"], [90, "61-90"], [91, "91-180"], [180, "91-180"],
    [181, "181-365"], [365, "181-365"], [366, "365+"],
  ])("maps %i days to %s", (days, expected) => {
    expect(agingBucket(days, DEFAULT_AGING_POLICY)).toBe(expected);
  });

  it("uses deterministic UTC dates", () => {
    expect(daysOverdue("2026-08-20T00:00:00.000Z", SYNTHETIC_AS_OF)).toBe(12);
  });
});

describe("computed first-value outputs", () => {
  const summary = computePortfolio(SYNTHETIC_TRUTH_SET, SYNTHETIC_AS_OF, DEFAULT_AGING_POLICY);

  it("computes ledger-backed portfolio totals and aging", () => {
    expect(summary.totalInvoicedCents).toBe(883_000_000);
    expect(summary.totalOutstandingCents).toBe(830_000_000);
    expect(summary.totalOverdueCents).toBe(810_000_000);
    expect(summary.aging).toEqual({
      CURRENT: 20_000_000,
      "1-30": 28_000_000,
      "31-60": 84_000_000,
      "61-90": 107_500_000,
      "91-180": 198_500_000,
      "181-365": 242_000_000,
      "365+": 150_000_000,
    });
    expect(Object.values(summary.aging).reduce((sum, amount) => sum + amount, 0)).toBe(summary.totalOutstandingCents);
  });

  it("finds missing contacts and unresolved identities", () => {
    expect(summary.missingContactCaseIds).toEqual(["case-b09", "case-b10", "case-b11", "case-b12"]);
    expect(summary.entityReviewCaseIds).toEqual(["case-b09", "case-b11", "case-b12"]);
  });

  it("detects missed promises while preserving open promises", () => {
    expect(summary.brokenPromiseCaseIds).toEqual(["case-b06"]);
    expect(SYNTHETIC_TRUTH_SET.cases.find(({ id }) => id === "case-b05")?.promises[0].status).toBe("OPEN");
  });

  it("keeps disputes visible in financial state", () => {
    expect(invoice("i11").state).toBe("DISPUTED");
    expect(outstandingCents(invoice("i11"), SYNTHETIC_TRUTH_SET.ledgerEntries)).toBe(25_000_000);
    expect(SYNTHETIC_TRUTH_SET.cases.find(({ id }) => id === "case-b04")?.events.some(({ type }) => type === "INVOICE_DISPUTED")).toBe(true);
  });

  it("treats legal age as a review trigger, not a legal conclusion", () => {
    expect(summary.legalReviewInvoiceIds).toEqual(["i09"]);
    expect(requiresLegalReview(daysOverdue(invoice("i09").dueAt, SYNTHETIC_AS_OF), DEFAULT_AGING_POLICY)).toBe(true);
  });
});

describe("evidence history and tenant isolation", () => {
  it("appends corrections without replacing prior history", () => {
    const first = appendCorrection([], { id: "c1", priorEvidenceId: "res-i17", correctedValue: "adm6", correctedBy: "reviewer", correctedAt: SYNTHETIC_AS_OF, reason: "Confirmed from synthetic evidence" });
    const second = appendCorrection(first, { id: "c2", priorEvidenceId: "c1", correctedValue: "adm4", correctedBy: "reviewer-2", correctedAt: "2026-09-02T00:00:00.000Z", reason: "Superseding synthetic review" });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual(first[0]);
  });

  it("scopes lists and rejects direct cross-tenant access", () => {
    const foreign = { ...invoice("i01"), id: "foreign", organizationId: "other-tenant" };
    expect(tenantRecords(SYNTHETIC_TRUTH_SET.organization.id, [invoice("i01"), foreign])).toEqual([invoice("i01")]);
    expect(() => requireTenantRecord(SYNTHETIC_TRUTH_SET.organization.id, foreign)).toThrow(TenantAccessError);
  });
});
