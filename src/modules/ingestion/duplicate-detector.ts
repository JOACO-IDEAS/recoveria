import { createHash } from "node:crypto";
import type { DocumentInput, DuplicateFinding, InvoiceCandidate } from "./types";

export class DuplicateDetector {
  readonly #documentHashes = new Map<string, string>();
  readonly #businessKeys = new Map<string, string>();

  inspect(document: DocumentInput, candidates: readonly InvoiceCandidate[]): DuplicateFinding[] {
    const findings: DuplicateFinding[] = [];
    const hash = createHash("sha256").update(document.bytes).digest("hex");
    const hashKey = `${document.organizationId}:${hash}`;
    const exact = this.#documentHashes.get(hashKey);
    if (exact) findings.push({ documentId: document.id, kind: "EXACT_DOCUMENT_DUPLICATE", matchesDocumentId: exact, evidence: [`sha256:${hash}`] });
    else this.#documentHashes.set(hashKey, document.id);

    for (const candidate of candidates) {
      if (!candidate.invoiceNumber.normalized || !candidate.amountCents.normalized || !candidate.invoiceDate.normalized || !candidate.issuer.normalized) continue;
      const key = [document.organizationId, candidate.issuer.normalized, candidate.invoiceNumber.normalized, candidate.invoiceDate.normalized, candidate.amountCents.normalized, candidate.currency.normalized].join(":");
      const existing = this.#businessKeys.get(key);
      if (existing && existing !== document.id && !findings.some(({ kind }) => kind === "EXACT_DOCUMENT_DUPLICATE")) {
        findings.push({ documentId: document.id, kind: "POSSIBLE_BUSINESS_DUPLICATE", matchesDocumentId: existing, evidence: ["tenant", "issuer", "invoiceNumber", "invoiceDate", "amount", "currency"] });
      } else if (!existing) this.#businessKeys.set(key, document.id);
    }
    return findings;
  }
}
