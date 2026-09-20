import type { EntityCatalogEntry } from "./candidate-builder";
import { ImportOrchestrator } from "./import-orchestrator";
import type { DocumentInput, ImportBatchResult } from "./types";

export interface DocumentUnderstandingRequest {
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly documents: readonly DocumentInput[];
  readonly entityCatalog: readonly EntityCatalogEntry[];
}

export interface DocumentUnderstandingProvider {
  readonly id: string;
  /** Deterministic parser/normalization contract used to decide checkpoint reuse. */
  readonly processingVersion: string;
  understand(request: DocumentUnderstandingRequest): Promise<ImportBatchResult>;
}

/** Local deterministic implementation. The interface is the only future AI seam. */
export class DeterministicDocumentUnderstandingProvider implements DocumentUnderstandingProvider {
  readonly id = "recoveria-deterministic-v1";
  readonly processingVersion = "recoveria-document-understanding-v1";
  readonly #orchestrator = new ImportOrchestrator();

  understand(request: DocumentUnderstandingRequest): Promise<ImportBatchResult> {
    return this.#orchestrator.run(
      request.organizationId,
      request.idempotencyKey,
      request.documents,
      request.entityCatalog,
    );
  }
}
