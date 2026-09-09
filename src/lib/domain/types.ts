export type Currency = "ARS";
export type LedgerEntryType = "INVOICE_ISSUED" | "PAYMENT" | "ADJUSTMENT" | "CREDIT" | "WRITE_OFF";
export type InvoiceState = "ISSUED" | "DISPUTED" | "CANCELLED";
export type PromiseStatus = "OPEN" | "KEPT" | "MISSED" | "CANCELLED";

export interface PartyRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly roles: readonly ("ISSUER" | "DEBTOR" | "ADMINISTRATION")[];
}

export interface BuildingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly administrationId?: string;
}

export interface ContactRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly administrationId?: string;
  readonly buildingId?: string;
  readonly points: readonly { readonly type: "EMAIL" | "PHONE"; readonly value: string }[];
}

export interface InvoiceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceNumber: string;
  readonly administrationId?: string;
  readonly buildingId?: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly currency: Currency;
  readonly totalCents: number;
  readonly state: InvoiceState;
  readonly evidenceRef: string;
}

export interface LedgerEntryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly type: LedgerEntryType;
  /** Signed minor units: charges positive; payments/credits/write-offs negative. */
  readonly amountCents: number;
  readonly currency: Currency;
  readonly effectiveAt: string;
  readonly evidenceRef: string;
}

export interface ResolutionEvidenceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly invoiceId: string;
  readonly rawValue: string;
  readonly normalizedCandidate: string;
  readonly candidatePartyIds: readonly string[];
  readonly status: "PENDING" | "CONFIRMED" | "REJECTED";
  readonly evidenceRef: string;
}

export interface CaseRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly administrationId?: string;
  readonly buildingId?: string;
  readonly invoiceIds: readonly string[];
  readonly currency: Currency;
  readonly events: readonly CaseEventRecord[];
  readonly promises: readonly PromiseRecord[];
}

export interface CaseEventRecord {
  readonly id: string;
  readonly type: "CASE_OPENED" | "NO_RESPONSE" | "INVOICE_DISPUTED" | "PARTIAL_PAYMENT" | "PROMISE_RECORDED" | "PROMISE_MISSED";
  readonly occurredAt: string;
  readonly evidenceRef: string;
}

export interface PromiseRecord {
  readonly id: string;
  readonly amountCents: number;
  readonly promisedFor: string;
  readonly status: PromiseStatus;
  readonly evidenceRef: string;
}

export interface SyntheticTruthSet {
  readonly organization: { readonly id: string; readonly name: string };
  readonly parties: readonly PartyRecord[];
  readonly buildings: readonly BuildingRecord[];
  readonly contacts: readonly ContactRecord[];
  readonly invoices: readonly InvoiceRecord[];
  readonly ledgerEntries: readonly LedgerEntryRecord[];
  readonly resolutionEvidence: readonly ResolutionEvidenceRecord[];
  readonly cases: readonly CaseRecord[];
}
