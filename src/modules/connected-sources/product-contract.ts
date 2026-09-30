import type { ConnectionLifecycleRecord } from "@/modules/ingestion/google-drive-activation";
import type { SanitizedDriveCorpusReport } from "@/modules/ingestion/google-drive-source-contract";

export type ConnectedSourceProvider = "GOOGLE_DRIVE";
export type ConnectedSourceConnectionStatus =
  | "NOT_CONNECTED"
  | "AUTHORIZING"
  | "CONNECTED_NO_ROOT"
  | "READY"
  | "REAUTHORIZATION_REQUIRED"
  | "DISCONNECTED";
export type ConnectedSourceSyncStatus =
  | "NEVER_RUN"
  | "QUEUED"
  | "DISCOVERING"
  | "ANALYZING"
  | "FINALIZING"
  | "COMPLETED"
  | "COMPLETED_WITH_REVIEW"
  | "FAILED";

export interface ConnectedSourceRoot {
  readonly providerRootReference: string;
  readonly displayName: string;
  readonly confirmedAt: string;
  readonly confirmedBy: string;
}

export interface ConnectedSourceSyncSummary {
  readonly documentsAnalyzed: number;
  readonly uniqueDocuments: number;
  readonly exactDuplicates: number;
  readonly possibleDuplicates: number;
  readonly detectedEntities: number;
  readonly reviewRequired: number;
  readonly documentsDiscovered?: number;
  readonly documentsDownloaded?: number;
  readonly documentsUnderstood?: number;
  readonly documentsReused?: number;
  readonly failures?: number;
  readonly checkpointVersion?: number;
}

export interface ConnectedSourceProductView {
  readonly organizationId: string;
  readonly connectionId: string;
  readonly provider: ConnectedSourceProvider;
  readonly connectionStatus: ConnectedSourceConnectionStatus;
  readonly syncStatus: ConnectedSourceSyncStatus;
  readonly rootDisplayName?: string;
  readonly documentCount?: number;
  readonly reviewCount?: number;
  readonly lastAttemptedSyncAt?: string;
  readonly lastSuccessfulSyncAt?: string;
}

export function toProductConnectionStatus(
  lifecycle: ConnectionLifecycleRecord | null,
  root: ConnectedSourceRoot | null,
): ConnectedSourceConnectionStatus {
  if (!lifecycle || lifecycle.state === "DISCONNECTED" || lifecycle.state === "REVOKED") return "NOT_CONNECTED";
  if (lifecycle.state === "AUTHORIZATION_PENDING") return "AUTHORIZING";
  if (lifecycle.state === "REAUTHORIZATION_REQUIRED") return "REAUTHORIZATION_REQUIRED";
  return root ? "READY" : "CONNECTED_NO_ROOT";
}

export function toFirstValueSummary(input: {
  readonly report: SanitizedDriveCorpusReport;
  readonly exactDuplicates: number;
  readonly possibleDuplicates: number;
  readonly detectedEntities: number;
}): ConnectedSourceSyncSummary {
  const duplicates = input.exactDuplicates + input.possibleDuplicates;
  return {
    documentsAnalyzed: input.report.invoicesUnderstood,
    uniqueDocuments: Math.max(0, input.report.invoicesUnderstood - duplicates),
    exactDuplicates: input.exactDuplicates,
    possibleDuplicates: input.possibleDuplicates,
    detectedEntities: input.detectedEntities,
    reviewRequired: input.report.reviewRequired,
  };
}

export function productProgress(input: {
  readonly executionStatus: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED";
  readonly discoveredCount: number;
  readonly downloadedCount: number;
  readonly report?: SanitizedDriveCorpusReport;
}): { readonly status: ConnectedSourceSyncStatus; readonly message: string; readonly completed?: number; readonly total?: number } {
  if (input.executionStatus === "PENDING") return { status: "QUEUED", message: "Preparing scan…" };
  if (input.executionStatus === "FAILED" || input.executionStatus === "ABORTED") return { status: "FAILED", message: "Scan could not be completed" };
  if (input.executionStatus === "SUCCEEDED" && input.report) {
    const needsReview = input.report.processingStatus === "PARTIAL" || input.report.reviewRequired > 0;
    return { status: needsReview ? "COMPLETED_WITH_REVIEW" : "COMPLETED", message: needsReview ? "Complete — review needed" : "Complete" };
  }
  if (input.discoveredCount === 0) return { status: "DISCOVERING", message: "Scanning folder…" };
  if (input.downloadedCount < input.discoveredCount) return { status: "ANALYZING", message: "Analyzing invoices…", completed: input.downloadedCount, total: input.discoveredCount };
  return { status: "FINALIZING", message: "Building your invoice view…" };
}
