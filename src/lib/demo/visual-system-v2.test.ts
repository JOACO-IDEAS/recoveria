import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { caseFactTone, duplicateConfidenceTone, reviewFlagTone } from "./presentation";

describe("Visual System V2 presentation contract", () => {
  it("defines distinct semantic tokens and approved type roles", async () => {
    const css = await readFile("src/app/globals.css", "utf8");
    for (const token of ["--paper-warm", "--brand", "--success", "--fact", "--attention", "--critical", "--dataflag"]) expect(css).toContain(token);
    expect(css).toContain('"IBM Plex Sans"');
    expect(css).toContain('"Source Serif 4"');
    expect(css).toContain('"IBM Plex Mono"');
    expect(css).toContain("font-variant-numeric:tabular-nums");
  });

  it("retires the equal KPI grid on Inicio and leads with attention, not metrics", async () => {
    const home = await readFile("src/app/page.tsx", "utf8");
    expect(home).toContain("inbox-question");
    expect(home).toContain("Requiere atención");
    expect(home).toContain("inbox-metrics");
    expect(home).not.toContain("home-kpis");
    expect(home).not.toContain("<Kpi");
    expect(home.indexOf("Requiere atención")).toBeLessThan(home.indexOf("inbox-metrics"));
  });

  it("keeps provenance nested and implements the human-decision zone", async () => {
    const casePage = await readFile("src/app/casos/[caseId]/page.tsx", "utf8");
    const invoicePage = await readFile("src/app/facturas/[invoiceId]/page.tsx", "utf8");
    expect(casePage).toContain("CaseDecisionPanel");
    expect(casePage).toContain("raw-provenance");
    expect(invoicePage).toContain("raw-provenance");
  });

  it("shows business fields before the technical import pipeline", async () => {
    const workspace = await readFile("src/components/intelligent-import-workspace.tsx", "utf8");
    expect(workspace.indexOf("<InvoiceFields")).toBeLessThan(workspace.indexOf("<Pipeline"));
    expect(workspace).toContain("displayText");
    expect(workspace).toContain("field-evidence");
  });

  it("maps case-fact values to their actual semantic severity", () => {
    expect(caseFactTone("NONE")).toBe("neutral");
    expect(caseFactTone("ACTIVE")).toBe("positive");
    expect(caseFactTone("MISSED")).toBe("critical");
    expect(caseFactTone("NONE", true)).toBe("critical");
  });

  it("keeps neutral portfolio states separate from real review flags", () => {
    expect(reviewFlagTone("Sin acción necesaria")).toBe("neutral");
    expect(reviewFlagTone("Revisar disputa")).toBe("attention");
    expect(reviewFlagTone("Requiere revisión")).toBe("attention");
  });

  it("distinguishes confirmed and possible duplicates within data quality", () => {
    expect(duplicateConfidenceTone("EXACT_DOCUMENT_DUPLICATE")).toBe("confirmed");
    expect(duplicateConfidenceTone("POSSIBLE_BUSINESS_DUPLICATE")).toBe("possible");
  });
});
