import type { PriorityTier } from "@/modules/operational-intelligence/types";

export type Direction = "asc" | "desc";
export type PortfolioSort = "outstanding" | "overdue" | "invoices";
export type InvoiceSort = "issued" | "due" | "outstanding" | "age";
export type CaseSort = "priority" | "outstanding";
export type CaseFilter = "all" | "critical" | "dispute" | "missedPromise" | "missingInformation";
export type ImportFilter = "all" | "review" | "unprocessed";

const priorityRank: Record<PriorityTier, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const direction = (value: number, order: Direction) => order === "asc" ? value : -value;

export function sortPortfolioRows<T extends { outstandingCents:number; overdueCents:number; invoiceCount:number; name:string }>(rows:readonly T[], key:PortfolioSort, order:Direction) {
  return [...rows].sort((a,b)=>direction(key==="outstanding"?a.outstandingCents-b.outstandingCents:key==="overdue"?a.overdueCents-b.overdueCents:a.invoiceCount-b.invoiceCount,order)||a.name.localeCompare(b.name));
}

export function sortInvoiceRows<T extends { issuedAt:string; dueAt:string; outstandingCents:number; daysOverdue:number; invoiceNumber:string }>(rows:readonly T[], key:InvoiceSort, order:Direction) {
  return [...rows].sort((a,b)=>direction(key==="issued"?a.issuedAt.localeCompare(b.issuedAt):key==="due"?a.dueAt.localeCompare(b.dueAt):key==="outstanding"?a.outstandingCents-b.outstandingCents:a.daysOverdue-b.daysOverdue,order)||a.invoiceNumber.localeCompare(b.invoiceNumber));
}

export function sortCaseRows<T extends { priorityTier:PriorityTier; attentionIndex:number; outstandingCents:number; caseId:string }>(rows:readonly T[], key:CaseSort, order:Direction) {
  return [...rows].sort((a,b)=>key==="priority"?(priorityRank[a.priorityTier]-priorityRank[b.priorityTier]||a.attentionIndex-b.attentionIndex||b.outstandingCents-a.outstandingCents||a.caseId.localeCompare(b.caseId)):direction(a.outstandingCents-b.outstandingCents,order)||priorityRank[a.priorityTier]-priorityRank[b.priorityTier]||a.caseId.localeCompare(b.caseId));
}

export function filterCaseRows<T extends { priorityTier:PriorityTier; dispute:boolean; promise:string; missingInformation:boolean }>(rows:readonly T[], filter:CaseFilter) {
  return rows.filter(row=>filter==="all"||filter==="critical"&&row.priorityTier==="CRITICAL"||filter==="dispute"&&row.dispute||filter==="missedPromise"&&row.promise==="MISSED"||filter==="missingInformation"&&row.missingInformation);
}

export function filterImportRows<T extends { status:string }>(rows:readonly T[], filter:ImportFilter) {
  return rows.filter(row=>filter==="all"||filter==="review"&&row.status==="REVIEW_REQUIRED"||filter==="unprocessed"&&(row.status==="FAILED"||row.status==="UNSUPPORTED"));
}
