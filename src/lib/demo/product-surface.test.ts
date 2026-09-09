import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGING_POLICY } from "@/lib/domain/aging";
import { computePortfolio } from "@/lib/domain/portfolio";
import { attentionOfToday } from "@/modules/operational-intelligence/attention";
import { DEFAULT_OPERATIONAL_POLICY } from "@/modules/operational-intelligence/policy";
import { SYNTHETIC_AS_OF, SYNTHETIC_TRUTH_SET } from "@/test/fixtures/synthetic-truth-set";
import { importDemo } from "./import-model";
import { demoModel } from "./product-model";

describe("Phase 4.7 product surface adapter", () => {
  it("uses the Phase 1 portfolio computation without changing its totals", () => {
    expect(demoModel.summary).toEqual(computePortfolio(SYNTHETIC_TRUTH_SET, SYNTHETIC_AS_OF, DEFAULT_AGING_POLICY));
  });

  it("reconciles every aging bucket to the outstanding total", () => {
    expect(Object.values(demoModel.summary.aging).reduce((sum, value) => sum + value, 0)).toBe(demoModel.summary.totalOutstandingCents);
  });

  it("uses the Phase 4 attention service and preserves ordering", () => {
    expect(demoModel.attention).toEqual(attentionOfToday(SYNTHETIC_TRUTH_SET.organization.id, demoModel.cases, DEFAULT_OPERATIONAL_POLICY));
  });

  it("grounds all visible reasons and blockers in evidence", () => {
    for (const item of demoModel.cases) {
      expect([...item.recommendation.reasons, ...item.recommendation.blockers].every((entry) => entry.evidenceRefs.length > 0)).toBe(true);
    }
  });

  it("derives invoice state from invoices and ledger entries", () => {
    expect(demoModel.invoices.find((item) => item.id === "i01")?.status).toBe("PAID");
    expect(demoModel.invoices.find((item) => item.id === "i10")?.status).toBe("PARTIALLY_PAID");
    expect(demoModel.invoices.find((item) => item.id === "i11")?.status).toBe("DISPUTED");
  });

  it("reconciles each entity roll-up to its invoices", () => {
    for (const entity of demoModel.entities) {
      expect(entity.outstandingCents).toBe(entity.invoices.reduce((sum, invoice) => sum + invoice.outstandingCents, 0));
    }
  });

  it("keeps tenant identity consistent across all surfaced objects", () => {
    expect(demoModel.cases.every((item) => item.organizationId === demoModel.organization.id)).toBe(true);
    expect(demoModel.invoices.every((item) => item.organizationId === demoModel.organization.id)).toBe(true);
  });

  it("uses Phase 2 ingestion states for the import review surface", async () => {
    const { batch } = await importDemo();
    expect(batch.results.some((item) => item.status === "REVIEW_REQUIRED")).toBe(true);
    expect(batch.results.every((item) => item.organizationId === demoModel.organization.id)).toBe(true);
  });

  it("keeps prioritization policy out of React routes", async () => {
    const routeFiles = ["page.tsx", "cartera/page.tsx", "facturas/page.tsx", "casos/page.tsx", "importaciones/page.tsx"];
    for (const routeFile of routeFiles) {
      const source = await readFile(path.join(process.cwd(), "src/app", routeFile), "utf8");
      expect(source).not.toContain("prioritizeCase");
      expect(source).not.toContain("staleContactDays");
      expect(source).not.toContain("legalReviewAfterDays");
    }
  });

  it("has no Client Zero path dependency in the product surface", async () => {
    for (const sourceFile of ["src/lib/demo/product-model.ts", "src/lib/demo/import-model.ts", "src/app/page.tsx"]) {
      const source = await readFile(path.join(process.cwd(), sourceFile), "utf8");
      expect(source).not.toMatch(/client-zero|\.private/i);
    }
  });
});
