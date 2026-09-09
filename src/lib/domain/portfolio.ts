import { agingBucket, daysOverdue, requiresLegalReview, type AgingPolicy } from "./aging";
import { outstandingCents } from "./ledger";
import type { SyntheticTruthSet } from "./types";

export interface PortfolioSummary {
  readonly totalInvoicedCents: number;
  readonly totalOutstandingCents: number;
  readonly totalOverdueCents: number;
  readonly aging: Readonly<Record<string, number>>;
  readonly largestAdministrations: readonly { id: string; outstandingCents: number }[];
  readonly largestBuildings: readonly { id: string; outstandingCents: number }[];
  readonly oldestReceivables: readonly { invoiceId: string; daysOverdue: number; outstandingCents: number }[];
  readonly missingContactCaseIds: readonly string[];
  readonly entityReviewCaseIds: readonly string[];
  readonly brokenPromiseCaseIds: readonly string[];
  readonly legalReviewInvoiceIds: readonly string[];
}

function groupOutstanding(rows: readonly { id?: string; outstandingCents: number }[]): readonly { id: string; outstandingCents: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) if (row.id) totals.set(row.id, (totals.get(row.id) ?? 0) + row.outstandingCents);
  return [...totals].map(([id, value]) => ({ id, outstandingCents: value })).sort((a, b) => b.outstandingCents - a.outstandingCents || a.id.localeCompare(b.id));
}

export function computePortfolio(truth: SyntheticTruthSet, asOf: string, policy: AgingPolicy): PortfolioSummary {
  const rows = truth.invoices.map((invoice) => ({
    invoice,
    outstandingCents: outstandingCents(invoice, truth.ledgerEntries),
    daysOverdue: daysOverdue(invoice.dueAt, asOf),
  }));
  const aging = Object.fromEntries(policy.buckets.map(({ key }) => [key, 0]));
  for (const row of rows) aging[agingBucket(row.daysOverdue, policy)] += row.outstandingCents;

  const contactsForCase = (caseId: string) => {
    const item = truth.cases.find(({ id }) => id === caseId);
    return truth.contacts.some((contact) => contact.points.length > 0 &&
      (contact.administrationId === item?.administrationId || contact.buildingId === item?.buildingId));
  };
  const pendingInvoiceIds = new Set(truth.resolutionEvidence.filter(({ status }) => status === "PENDING").map(({ invoiceId }) => invoiceId));

  return {
    totalInvoicedCents: truth.invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    totalOutstandingCents: rows.reduce((sum, row) => sum + row.outstandingCents, 0),
    totalOverdueCents: rows.filter((row) => row.daysOverdue > 0).reduce((sum, row) => sum + row.outstandingCents, 0),
    aging,
    largestAdministrations: groupOutstanding(rows.map(({ invoice, outstandingCents: balance }) => ({ id: invoice.administrationId, outstandingCents: balance }))),
    largestBuildings: groupOutstanding(rows.map(({ invoice, outstandingCents: balance }) => ({ id: invoice.buildingId, outstandingCents: balance }))),
    oldestReceivables: rows.filter(({ outstandingCents: balance }) => balance > 0).sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 5).map(({ invoice, ...rest }) => ({ invoiceId: invoice.id, ...rest })),
    missingContactCaseIds: truth.cases.filter(({ id }) => !contactsForCase(id)).map(({ id }) => id),
    entityReviewCaseIds: truth.cases.filter(({ invoiceIds }) => invoiceIds.some((id) => pendingInvoiceIds.has(id))).map(({ id }) => id),
    brokenPromiseCaseIds: truth.cases.filter(({ promises }) => promises.some(({ status }) => status === "MISSED")).map(({ id }) => id),
    legalReviewInvoiceIds: rows.filter(({ daysOverdue: days, outstandingCents: balance }) => balance > 0 && requiresLegalReview(days, policy)).map(({ invoice }) => invoice.id),
  };
}
