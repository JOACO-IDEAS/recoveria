import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agingLabel, attentionLabel, documentLabel, filterOptions, formatLabel, importStatusLabel, invoiceStatusLabel, priorityLabel, promiseLabel } from "./presentation";
import { demoModel } from "./product-model";

const leakedEnums = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "FOLLOW_UP", "VERIFY_PROMISE", "REVIEW_ENTITY", "REVIEW_DISPUTE", "REVIEW_LEGAL_THRESHOLD", "NO_ACTION", "OVERDUE", "CURRENT", "PARTIALLY_PAID", "DISPUTED", "REVIEW_REQUIRED", "PDF_NATIVE"];

describe("Phase 4.7B Spanish presentation", () => {
  it("translates every surfaced priority and recommendation", () => {
    for (const item of demoModel.attention) {
      expect(priorityLabel(item.priorityTier)).not.toBe(item.priorityTier);
      expect(attentionLabel(item.attentionType)).not.toBe(item.attentionType);
    }
  });

  it("translates supported invoice states", () => {
    for (const invoice of demoModel.invoices) expect(leakedEnums).not.toContain(invoiceStatusLabel(invoice.status));
  });

  it("uses human-readable aging labels", () => {
    expect(Object.keys(demoModel.summary.aging).map(agingLabel)).toEqual(["Al día", "1–30 días", "31–60 días", "61–90 días", "91–180 días", "181–365 días", "Más de 1 año"]);
  });

  it("provides Spanish invoice filters", () => {
    expect(filterOptions.map(([, label]) => label)).toEqual(["Todas", "Vencidas", "Al día", "Pagadas", "En disputa", "Requieren revisión", "Más antiguas"]);
  });

  it("translates import states and formats", () => {
    expect(importStatusLabel("PARSED")).toBe("Procesado");
    expect(importStatusLabel("REVIEW_REQUIRED")).toBe("Requiere revisión");
    expect(formatLabel("PDF_NATIVE")).toBe("PDF");
  });

  it("translates promise states", () => {
    expect(promiseLabel("NONE")).toBe("Sin promesa");
    expect(promiseLabel("MISSED")).toBe("Promesa incumplida");
  });

  it("never exposes internal document IDs as their visible label", () => {
    expect(documentLabel("pdf-21")).toBe("Documento 21");
  });

  it("keeps Spanish navigation and the demo indicator", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    for (const label of ["Inicio", "Cartera", "Casos", "Documentos", "Agente", "Configuración", "Datos de demostración"]) expect(source).toContain(label);
  });

  it("does not render known enums through direct replacements", async () => {
    const files = ["src/app/page.tsx", "src/app/cartera/page.tsx", "src/app/casos/page.tsx", "src/app/importaciones/page.tsx", "src/components/ui.tsx"];
    for (const file of files) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      expect(source).not.toContain("replaceAll('_',' ')");
      expect(source).not.toContain('replaceAll("_", " ")');
    }
  });

  it("preserves all domain-backed portfolio values", () => {
    expect(demoModel.summary.totalOutstandingCents).toBe(830_000_000);
    expect(demoModel.summary.totalOverdueCents).toBe(810_000_000);
    expect(demoModel.attention).toHaveLength(8);
  });
});
