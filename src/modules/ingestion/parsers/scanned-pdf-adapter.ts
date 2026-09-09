import type { Classification, DocumentInput, DocumentParseResult } from "../types";

/** Offline OCR boundary. Phase 2 deliberately refuses to fabricate scan text. */
export const ScannedPdfAdapter = {
  route(document: DocumentInput, classification: Classification): DocumentParseResult {
    return {
      documentId: document.id,
      organizationId: document.organizationId,
      classification,
      status: "REVIEW_REQUIRED",
      candidates: [],
      reviewReasons: ["OCR_REQUIRED_OFFLINE_ADAPTER_NOT_IMPLEMENTED"],
    };
  },
};
