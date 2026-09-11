import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { demoModel } from "./product-model";
import { buildIntelligentImportScenarios, DEMO_IMPORT_ORGANIZATION_ID } from "./intelligent-import";
import { canApproveScenario } from "./intelligent-import-types";
import { DeterministicDocumentUnderstandingProvider } from "@/modules/ingestion/document-understanding-provider";
import { buildSyntheticDocumentCorpus, SYNTHETIC_ENTITY_CATALOG } from "@/test/fixtures/document-corpus";

describe("Phase 5A intelligent import workspace", () => {
  it("covers every required deterministic document outcome", async () => {
    const scenarios = await buildIntelligentImportScenarios();
    expect(scenarios.map(item => item.kind)).toEqual(["SUCCESS", "MISSING", "AMBIGUOUS", "CONTRADICTORY", "EXACT_DUPLICATE", "POSSIBLE_DUPLICATE", "SCANNED", "UNSUPPORTED"]);
    expect(scenarios.find(item => item.kind === "SUCCESS")?.status).toBe("PARSED");
    expect(scenarios.find(item => item.kind === "MISSING")?.invoice?.dueDate.status).toBe("MISSING");
    expect(scenarios.find(item => item.kind === "AMBIGUOUS")?.invoice?.entity.candidateIds).toHaveLength(2);
    expect(scenarios.find(item => item.kind === "CONTRADICTORY")?.invoice?.amountCents.status).toBe("AMBIGUOUS");
    expect(scenarios.find(item => item.kind === "EXACT_DUPLICATE")?.duplicate?.kind).toBe("EXACT_DOCUMENT_DUPLICATE");
    expect(scenarios.find(item => item.kind === "POSSIBLE_DUPLICATE")?.duplicate?.kind).toBe("POSSIBLE_BUSINESS_DUPLICATE");
    expect(scenarios.find(item => item.kind === "SCANNED")?.invoice).toBeNull();
    expect(scenarios.find(item => item.kind === "UNSUPPORTED")?.status).toBe("UNSUPPORTED");
  });

  it("models acceptance, candidate choice, unresolved and rejection explicitly", async () => {
    const scenarios = await buildIntelligentImportScenarios();
    const success = scenarios.find(item => item.kind === "SUCCESS")!;
    const ambiguous = scenarios.find(item => item.kind === "AMBIGUOUS")!;
    const unsupported = scenarios.find(item => item.kind === "UNSUPPORTED")!;
    expect(canApproveScenario(success, null)).toBe(true);
    expect(canApproveScenario(ambiguous, null)).toBe(false);
    expect(canApproveScenario(ambiguous, "ACCEPT_SUGGESTION")).toBe(true);
    expect(canApproveScenario(ambiguous, "CHOOSE_CANDIDATE")).toBe(true);
    expect(canApproveScenario(ambiguous, "LEAVE_UNRESOLVED")).toBe(true);
    expect(canApproveScenario(ambiguous, "REJECT")).toBe(false);
    expect(canApproveScenario(unsupported, "ACCEPT_SUGGESTION")).toBe(false);
  });

  it("rejects cross-tenant documents at the provider boundary", async () => {
    const { documents } = await buildSyntheticDocumentCorpus();
    const provider = new DeterministicDocumentUnderstandingProvider();
    await expect(provider.understand({ organizationId: "org-other", idempotencyKey: "tenant-check", documents: [documents[0]], entityCatalog: SYNTHETIC_ENTITY_CATALOG })).rejects.toThrow("CROSS_TENANT_DOCUMENT_REJECTED");
  });

  it("leaves canonical Phase 1–4 totals unchanged", async () => {
    const before = JSON.stringify({ summary: demoModel.summary, portfolio: demoModel.operationalPortfolio, invoices: demoModel.invoices });
    await buildIntelligentImportScenarios();
    expect(JSON.stringify({ summary: demoModel.summary, portfolio: demoModel.operationalPortfolio, invoices: demoModel.invoices })).toBe(before);
    expect(DEMO_IMPORT_ORGANIZATION_ID).toBe("org-recoveria-synthetic");
  });

  it("contains no Client Zero path or external provider integration", async () => {
    const files = ["src/lib/demo/intelligent-import.ts", "src/lib/demo/intelligent-import-types.ts", "src/modules/ingestion/document-understanding-provider.ts", "src/components/intelligent-import-workspace.tsx"];
    const source = (await Promise.all(files.map(file => readFile(file, "utf8")))).join("\n").toLowerCase();
    expect(source).not.toContain(".private/");
    expect(source).not.toContain("client-zero/");
    expect(source).not.toMatch(/openai|anthropic|claude|fetch\(|axios|api[_-]?key/);
  });
});
