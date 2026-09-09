import type { DocumentTruth, ExpectedInvoiceCandidate } from "@/test/fixtures/document-corpus";
import type { ImportBatchResult, InvoiceCandidate } from "./types";

export interface AccuracyMetric { readonly correct: number; readonly total: number; readonly rate: number }
export interface Phase2Metrics {
  readonly documentClassification: AccuracyMetric;
  readonly parseSuccess: AccuracyMetric;
  readonly fields: Readonly<Record<"invoiceNumber" | "amountCents" | "currency" | "invoiceDate" | "dueDate" | "cuit" | "administration" | "building", AccuracyMetric>>;
  readonly duplicateDetection: AccuracyMetric;
  readonly falseConfirmations: number;
  readonly reviewRecall: AccuracyMetric;
}

const metric = (correct: number, total: number): AccuracyMetric => ({ correct, total, rate: total === 0 ? 1 : correct / total });

const actualValue = (candidate: InvoiceCandidate, field: keyof ExpectedInvoiceCandidate): string | number | null => {
  if (field === "administration") return candidate.administration.normalized;
  if (field === "building") return candidate.building.normalized;
  return candidate[field].normalized;
};

export function calculatePhase2Metrics(batch: ImportBatchResult, truth: readonly DocumentTruth[]): Phase2Metrics {
  const resultMap = new Map(batch.results.map((result) => [result.documentId, result]));
  const comparisons: Record<keyof Phase2Metrics["fields"], boolean[]> = {
    invoiceNumber: [], amountCents: [], currency: [], invoiceDate: [], dueDate: [], cuit: [], administration: [], building: [],
  };
  for (const document of truth) {
    const result = resultMap.get(document.documentId);
    document.expectedCandidates.forEach((expected, index) => {
      const actual = result?.candidates[index];
      for (const key of Object.keys(comparisons) as (keyof typeof comparisons)[]) comparisons[key].push(actual !== undefined && actualValue(actual, key) === expected[key]);
    });
  }
  const expectedDuplicates = truth.filter(({ expectedDuplicate }) => expectedDuplicate);
  const correctlyDetected = expectedDuplicates.filter((item) => batch.duplicateFindings.some((finding) => finding.documentId === item.documentId && finding.kind === item.expectedDuplicate)).length;
  const problemDocuments = truth.filter(({ expectedReview }) => expectedReview);
  const correctlyRouted = problemDocuments.filter((item) => resultMap.get(item.documentId)?.status !== "PARSED").length;
  return {
    documentClassification: metric(truth.filter((item) => resultMap.get(item.documentId)?.classification.format === item.expectedFormat).length, truth.length),
    parseSuccess: metric(batch.documentsParsed, truth.length),
    fields: Object.fromEntries(Object.entries(comparisons).map(([key, values]) => [key, metric(values.filter(Boolean).length, values.length)])) as Phase2Metrics["fields"],
    duplicateDetection: metric(correctlyDetected, expectedDuplicates.length),
    falseConfirmations: batch.results.flatMap(({ candidates }) => candidates).filter(({ administrationSignal }) => administrationSignal.confirmedEntityId !== null).length,
    reviewRecall: metric(correctlyRouted, problemDocuments.length),
  };
}
