import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Visual System V2 presentation contract", () => {
  it("defines distinct semantic tokens and approved type roles", async () => {
    const css = await readFile("src/app/globals.css", "utf8");
    for (const token of ["--paper-warm", "--brand", "--success", "--fact", "--attention", "--critical", "--dataflag"]) expect(css).toContain(token);
    expect(css).toContain('"IBM Plex Sans"');
    expect(css).toContain('"Source Serif 4"');
    expect(css).toContain('"IBM Plex Mono"');
    expect(css).toContain("font-variant-numeric:tabular-nums");
  });

  it("retires the equal KPI grid on Inicio", async () => {
    const home = await readFile("src/app/page.tsx", "utf8");
    expect(home).toContain("financial-hero");
    expect(home).toContain("supporting-metrics");
    expect(home).not.toContain("home-kpis");
    expect(home).not.toContain("<Kpi");
  });

  it("keeps provenance nested and reserves the human-decision zone", async () => {
    const casePage = await readFile("src/app/casos/[caseId]/page.tsx", "utf8");
    const invoicePage = await readFile("src/app/facturas/[invoiceId]/page.tsx", "utf8");
    expect(casePage).toContain("decision-reserve");
    expect(casePage).toContain("raw-provenance");
    expect(invoicePage).toContain("raw-provenance");
  });

  it("shows business fields before the technical import pipeline", async () => {
    const workspace = await readFile("src/components/intelligent-import-workspace.tsx", "utf8");
    expect(workspace.indexOf("<InvoiceFields")).toBeLessThan(workspace.indexOf("<Pipeline"));
    expect(workspace).toContain("displayText");
    expect(workspace).toContain("field-evidence");
  });
});
