import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { answerAgentQuestion } from "./agent";
import { buildCommunicationPreview, decisionOptionsForCase, knowledgeGapsForCase, PAYMENT_CLAIMS, paymentClaimForCase } from "./case-workspace";
import { buildDocumentExtraction } from "./document-extraction";
import { demoModel as m } from "./product-model";

describe("Phase 4.7 product surface v1 — semantic invariants", () => {
  it("never labels an invoice's nominal total or document balance as the current balance", () => {
    for (const invoice of m.invoices) {
      const extraction = buildDocumentExtraction(invoice);
      const balanceField = extraction.fields.find((f) => f.highlightId === "balance");
      const statusField = extraction.fields.find((f) => f.highlightId === "payment-status");
      expect(balanceField?.confidence).toBe("UNKNOWN");
      expect(statusField?.confidence).toBe("UNKNOWN");
    }
  });

  it("keeps every payment claim awaiting verification, never confirmed", () => {
    expect(PAYMENT_CLAIMS.length).toBeGreaterThan(0);
    for (const claim of PAYMENT_CLAIMS) expect(claim.status).toBe("AWAITING_VERIFICATION");
  });

  it("never offers a one-click confirmation that a payment claim is real money received", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/case-decision-panel.tsx"), "utf8");
    expect(source).not.toMatch(/marcar como pagad/i);
    expect(source.toLowerCase()).toContain("no cambia hasta que exista una imputación bancaria confirmada");
  });

  it("pauses routine follow-up preparation for disputed cases", () => {
    const disputed = m.cases.find((c) => c.dispute.value);
    expect(disputed).toBeDefined();
    const decisions = decisionOptionsForCase(disputed!.id);
    expect(decisions.some((d) => d.id === "PREPARE_FOLLOW_UP")).toBe(false);
  });

  it("shows a pause banner on the case page when a case is disputed", async () => {
    const source = await readFile(path.join(process.cwd(), "src/app/casos/[caseId]/page.tsx"), "utf8");
    expect(source).toContain("pause-banner");
    expect(source).toContain("seguimiento automático está detenido");
  });

  it("keeps a document's unresolved due date UNKNOWN rather than guessing", () => {
    const invoice = m.invoices.find((i) => i.id === "i15");
    expect(invoice).toBeDefined();
    const extraction = buildDocumentExtraction(invoice!);
    const dueField = extraction.fields.find((f) => f.highlightId === "due");
    expect(dueField?.confidence).toBe("UNKNOWN");
  });

  it("never represents legal review as legal action already taken", () => {
    const legalCase = m.cases.find((c) => c.recommendation.attentionType === "REVIEW_LEGAL_THRESHOLD");
    expect(legalCase).toBeDefined();
    const { unknown } = knowledgeGapsForCase(legalCase!.id);
    expect(unknown.some((item) => /no implica una acción legal iniciada/i.test(item.text))).toBe(true);
  });

  it("marks every communication preview as requiring revalidation and never as sent", () => {
    const preview = buildCommunicationPreview(m.attention[0]?.caseId ?? "case-b01");
    if (preview) {
      expect(preview.requiresRevalidation).toBe(true);
      expect(JSON.stringify(preview)).not.toMatch(/"status":"(SENT|DELIVERED)"/i);
    }
  });

  it("never issues a real network or provider call from the communication preview UI", async () => {
    for (const file of ["src/components/case-decision-panel.tsx", "src/lib/demo/case-workspace.ts"]) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/fetch\(|resend|nodemailer|twilio/i);
    }
  });

  it("keeps the Agent honest about uncertainty instead of upgrading a claim to a fact", () => {
    const answer = answerAgentQuestion("¿Qué sabemos de este pago?");
    expect(answer.text).toMatch(/DESCONOCIDO/);
    expect(answer.text.toLowerCase()).not.toMatch(/pago confirmado/);
  });

  it("keeps the Agent's avoid-contact answer grounded in disputes, uncertainty, and legal review — not silent exclusion", () => {
    const answer = answerAgentQuestion("¿Qué casos no deberíamos contactar?");
    expect(answer.caseIds && answer.caseIds.length).toBeGreaterThan(0);
  });

  it("never sends anything when the Agent is asked to prepare follow-ups", () => {
    const answer = answerAgentQuestion("Preparame el seguimiento de los casos sin respuesta.");
    expect(answer.text).toMatch(/no se envió nada/i);
  });

  it("has no Client Zero path or identifier dependency anywhere in the Phase 4.7 showroom layer", async () => {
    const files = [
      "src/lib/demo/case-workspace.ts",
      "src/lib/demo/document-extraction.ts",
      "src/lib/demo/agent.ts",
      "src/components/case-decision-panel.tsx",
      "src/components/document-viewer.tsx",
      "src/components/agent-console.tsx",
      "src/app/page.tsx",
      "src/app/agente/page.tsx",
      "src/app/configuracion/page.tsx",
    ];
    for (const file of files) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/client-zero|\.private|christophersen/i);
    }
  });

  it("keeps the synthetic dataset's payment claim disconnected from the ledger balance", () => {
    const claim = paymentClaimForCase("case-b02");
    expect(claim).toBeDefined();
    const invoice = m.invoices.find((i) => i.id === claim!.invoiceIds[0]);
    // The claimed amount is not silently netted against the documented outstanding balance.
    expect(invoice!.outstandingCents).toBeGreaterThan(0);
  });
});
