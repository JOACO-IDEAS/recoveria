import { describe, expect, it } from "vitest";
import { productProgress, toFirstValueSummary, toProductConnectionStatus, type ConnectedSourceRoot } from "./product-contract";

const root: ConnectedSourceRoot = { providerRootReference: "opaque-root", displayName: "Facturas emitidas", confirmedAt: "2026-09-27T00:00:00Z", confirmedBy: "operator" };
const lifecycle = (state: "DISCONNECTED" | "AUTHORIZATION_PENDING" | "CONNECTED" | "REAUTHORIZATION_REQUIRED" | "REVOKED") => ({ organizationId: "org", connectionId: "connection", state, revision: 1 });

describe("connected-source product contracts", () => {
  it("derives product connection state without duplicating the durable OAuth lifecycle", () => {
    expect(toProductConnectionStatus(null, null)).toBe("NOT_CONNECTED");
    expect(toProductConnectionStatus(lifecycle("AUTHORIZATION_PENDING"), null)).toBe("AUTHORIZING");
    expect(toProductConnectionStatus(lifecycle("CONNECTED"), null)).toBe("CONNECTED_NO_ROOT");
    expect(toProductConnectionStatus(lifecycle("CONNECTED"), root)).toBe("READY");
    expect(toProductConnectionStatus(lifecycle("REAUTHORIZATION_REQUIRED"), root)).toBe("REAUTHORIZATION_REQUIRED");
    expect(toProductConnectionStatus(lifecycle("REVOKED"), root)).toBe("NOT_CONNECTED");
  });

  it("exposes only truthful execution-ledger progress", () => {
    expect(productProgress({ executionStatus: "PENDING", discoveredCount: 0, downloadedCount: 0 })).toEqual({ status: "QUEUED", message: "Preparing scan…" });
    expect(productProgress({ executionStatus: "RUNNING", discoveredCount: 0, downloadedCount: 0 })).toEqual({ status: "DISCOVERING", message: "Scanning folder…" });
    expect(productProgress({ executionStatus: "RUNNING", discoveredCount: 40, downloadedCount: 18 })).toEqual({ status: "ANALYZING", message: "Analyzing invoices…", completed: 18, total: 40 });
    expect(productProgress({ executionStatus: "RUNNING", discoveredCount: 40, downloadedCount: 40 })).toEqual({ status: "FINALIZING", message: "Building your invoice view…" });
    expect(productProgress({ executionStatus: "FAILED", discoveredCount: 40, downloadedCount: 18 })).toEqual({ status: "FAILED", message: "Scan could not be completed" });
  });

  it("builds first value only from documentary corpus facts", () => {
    const summary = toFirstValueSummary({
      report: { processingStatus: "COMPLETE", filesDiscovered: 40, newFiles: 40, changedFiles: 0, reusedFiles: 0, unsupportedFiles: 0, failedFiles: 0, invoicesUnderstood: 40, reviewRequired: 7, contradictions: 0 },
      exactDuplicates: 1,
      possibleDuplicates: 0,
      detectedEntities: 5,
    });
    expect(summary).toEqual({ documentsAnalyzed: 40, uniqueDocuments: 39, exactDuplicates: 1, possibleDuplicates: 0, detectedEntities: 5, reviewRequired: 7 });
    expect(summary).not.toHaveProperty("outstandingBalance");
    expect(summary).not.toHaveProperty("paymentStatus");
  });
});
