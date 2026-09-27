import type { CorpusDocumentType } from "@/modules/ingestion/corpus-classification";
import type { DocumentSourceType } from "@/modules/ingestion/document-source";
import type {
  DateSemantic,
  DocumentRelationshipKind,
  EvidenceClassification,
  ExtractionConfidence,
  FieldStatus,
  ObservationRegion,
  ParserStatus,
  ProposalStatus,
} from "@/modules/ingestion/types";

export interface ProductSurfaceScope {
  readonly organizationId: string;
  readonly sourceType: DocumentSourceType;
  readonly sourceId: string;
  readonly connectionId: string;
}

export interface ProductSurfaceField<T> {
  readonly value: T | null;
  readonly status: FieldStatus;
  readonly classification: EvidenceClassification;
  readonly confidence: ExtractionConfidence;
  readonly evidenceAvailable: boolean;
  readonly evidenceCount: number;
}

export interface ProductSurfaceDateField extends ProductSurfaceField<string> {
  readonly semantic: DateSemantic;
}

export type ProductSurfaceDuplicateStatus = "NONE" | "EXACT_DOCUMENT_DUPLICATE" | "POSSIBLE_BUSINESS_DUPLICATE";

export interface ProductSurfaceReviewStatus {
  readonly required: boolean;
  readonly reasonCount: number;
  readonly hasContradictions: boolean;
}

export interface ProductSurfaceRelationshipSummary {
  readonly proposalCount: number;
  readonly reviewRequiredCount: number;
  readonly contradictionCount: number;
  readonly unmatchedSignalCount: number;
}

export interface ProductSurfaceInvoiceReadModel {
  readonly documentId: string;
  readonly source: {
    readonly sourceType: DocumentSourceType;
    readonly displayName: string;
    readonly mimeType: string;
    readonly modifiedAt: string | null;
  };
  readonly documentClassification: CorpusDocumentType;
  readonly parserStatus: ParserStatus;
  readonly invoiceNumber: ProductSurfaceField<string>;
  readonly issueDate: ProductSurfaceDateField;
  readonly documentedDueDate: ProductSurfaceDateField;
  readonly documentedNominalTotalCents: ProductSurfaceField<number>;
  readonly currency: ProductSurfaceField<string>;
  /** A documentary candidate only. This is never a confirmed customer or administration. */
  readonly entityCandidate: ProductSurfaceField<string>;
  readonly duplicateStatus: ProductSurfaceDuplicateStatus;
  readonly reviewStatus: ProductSurfaceReviewStatus;
  readonly confidenceSummary: ExtractionConfidence;
  readonly classificationSummary: Readonly<Record<EvidenceClassification, number>>;
  readonly provenanceAvailable: boolean;
  readonly relationships: ProductSurfaceRelationshipSummary;
}

export type ProductSurfaceEvidenceField =
  | "invoiceNumber"
  | "issueDate"
  | "documentedDueDate"
  | "documentedNominalTotalCents"
  | "currency"
  | "entityCandidate";

export interface ProductSurfaceEvidenceObservation {
  readonly observationId: string;
  readonly page: number;
  readonly region: ObservationRegion;
  readonly excerpt: string;
  readonly extractionMethod: "LOCAL_PDF_NATIVE" | "LOCAL_OCR";
  readonly confidence: Exclude<ExtractionConfidence, "UNAVAILABLE">;
}

export interface ProductSurfaceEvidenceReadModel {
  readonly documentId: string;
  readonly source: {
    readonly sourceType: DocumentSourceType;
    readonly displayName: string;
  };
  readonly field: ProductSurfaceEvidenceField;
  readonly value: string | number | null;
  readonly status: FieldStatus;
  readonly classification: EvidenceClassification;
  readonly confidence: ExtractionConfidence;
  readonly observations: readonly ProductSurfaceEvidenceObservation[];
  readonly contradictions: readonly {
    readonly kind: DocumentRelationshipKind;
    readonly relatedDocumentId: string;
    readonly signals: readonly string[];
  }[];
  /** Kept out of the normal business view; useful only in an advanced support surface. */
  readonly technical: {
    readonly parserVersions: readonly string[];
  };
}

export interface ProductSurfaceRelationshipReadModel {
  readonly documentId: string;
  readonly summary: ProductSurfaceRelationshipSummary;
  readonly proposals: readonly {
    readonly kind: DocumentRelationshipKind;
    readonly status: ProposalStatus;
    readonly classification: EvidenceClassification;
    readonly confidence: ExtractionConfidence;
    readonly relatedDocumentId: string;
    readonly reviewRequired: boolean;
    readonly supportingSignals: readonly string[];
    readonly contradictingSignals: readonly string[];
  }[];
  readonly unmatchedSignals: readonly {
    readonly kind: DocumentRelationshipKind;
    readonly reason: string;
  }[];
}

export interface ProductSurfaceInvoiceFilters {
  readonly search?: string;
  readonly issueDateFrom?: string;
  readonly issueDateTo?: string;
  readonly documentedNominalTotalCentsMin?: number;
  readonly documentedNominalTotalCentsMax?: number;
  readonly entityCandidate?: string;
  readonly confidence?: ExtractionConfidence;
  readonly reviewRequired?: boolean;
  readonly duplicateStatus?: ProductSurfaceDuplicateStatus;
  readonly classification?: EvidenceClassification;
}
