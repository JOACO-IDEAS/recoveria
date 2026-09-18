import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { answerAgentQuestion } from "./agent";
import { buildDocumentExtraction } from "./document-extraction";
import { demoModel as m } from "./product-model";

const source = (file: string) => readFile(path.join(process.cwd(), file), "utf8");

describe("Phase 4.7C universal evidence inspector", () => {
  it("uses the universal inspector reference from case detail", async () => {
    expect(await source("src/app/casos/[caseId]/page.tsx")).toContain("<EvidenceReference invoiceId={i.id}");
  });

  it("uses the same universal inspector reference from Cartera detail", async () => {
    const text = await source("src/app/cartera/[entityId]/page.tsx");
    expect(text.match(/<EvidenceReference invoiceId=/g)?.length).toBe(2);
  });

  it("returns a real synthetic invoice reference in the Agent payment answer", () => {
    const answer = answerAgentQuestion("¿Qué sabemos de este pago?");
    expect(answer.invoiceIds).toEqual(["i22"]);
    expect(m.invoices.some((invoice) => invoice.id === answer.invoiceIds?.[0])).toBe(true);
  });

  it("keeps Agent turns outside the inspector so conversation state survives open and close", async () => {
    const text = await source("src/components/agent-console.tsx");
    expect(text).toContain("useState<readonly AgentTurn[]>");
    expect(text).toContain("<EvidenceReference invoiceId={id}");
  });

  it("connects a selected FACT to its synthetic source region", async () => {
    const text = await source("src/components/document-viewer.tsx");
    expect(text).toContain("setActive(field.highlightId)");
    expect(text).toContain('active === id ? "highlighted"');
  });

  it("does not fabricate provenance for UNKNOWN fields", async () => {
    const text = await source("src/components/document-viewer.tsx");
    expect(text).toContain('field.confidence === "UNKNOWN"');
    expect(text).toContain("No se encontró un dato explícito en el documento.");
    expect(text).not.toContain('<Region id="payment-status"');
    expect(text).not.toContain('<Region id="balance"');
  });

  it("keeps nominal total separate from unknown current balance", () => {
    const invoice = m.invoices.find((item) => item.id === "i15")!;
    const fields = buildDocumentExtraction(invoice).fields;
    expect(fields.find((field) => field.highlightId === "total")?.confidence).toBe("FACT");
    expect(fields.find((field) => field.highlightId === "balance")?.confidence).toBe("UNKNOWN");
  });

  it("supports Escape close, focus restoration and dialog semantics", async () => {
    const text = await source("src/components/evidence-inspector.tsx");
    expect(text).toContain('event.key === "Escape"');
    expect(text).toContain('role="dialog"');
    expect(text).toContain("triggerRef.current?.focus()");
  });

  it("contains no communication-send or provider path", async () => {
    const files = ["src/components/evidence-inspector.tsx", "src/components/document-viewer.tsx"];
    for (const file of files) expect(await source(file)).not.toMatch(/fetch\(|resend|nodemailer|sendEmail/i);
  });

  it("stays inside the synthetic boundary", async () => {
    const files = ["src/components/evidence-inspector.tsx", "src/components/document-viewer.tsx"];
    for (const file of files) expect(await source(file)).not.toMatch(/client-zero|\.private|concilia|neon/i);
  });
});
