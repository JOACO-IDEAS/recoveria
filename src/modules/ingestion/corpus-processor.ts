import { createHash } from "node:crypto";
import { proposeCustomerIdentityClusters, type CustomerIdentitySignal, type IdentityClusterProposal } from "@/modules/entity-resolution/cohort-clustering";
import type { EntityCatalogEntry } from "./candidate-builder";
import type { DocumentSource, SourceProvenance } from "./document-source";
import type { DocumentUnderstandingProvider } from "./document-understanding-provider";
import { proposeDocumentRelationships, type CohortDocument } from "./document-relationships";
import type { DocumentParseResult, DocumentRelationshipReport, ExtractionConfidence, ObservedCandidate, StructuredDocumentUnderstanding } from "./types";
import type { IncrementalCorpusRun, SourceCheckpoint } from "./incremental-corpus-processor";
import { classifyCorpusDocument, type CorpusDocumentType } from "./corpus-classification";

export type { CorpusDocumentType } from "./corpus-classification";

export interface CorpusSourceRecord {
  readonly sourceDocumentId: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly modifiedAt?: string;
  readonly providerContentIdentity?: string;
  readonly fingerprintSha256: string;
  readonly supported: boolean;
  readonly provenance: SourceProvenance;
}

export interface CorpusDocumentResult {
  readonly source: CorpusSourceRecord;
  readonly classification: CorpusDocumentType;
  readonly parse: DocumentParseResult;
}

export interface CorpusSummary {
  readonly documentsWithResult: number;
  readonly documentsProcessed: number;
  readonly documentsUnsupported: number;
  readonly documentsClassifiedAsInvoice: number;
  readonly unknownDocuments: number;
  readonly exactDuplicates: number;
  readonly possibleDuplicates: number;
  readonly identityClusters: number;
  readonly unresolvedIdentities: number;
  readonly relationshipProposals: number;
  readonly contradictions: number;
  readonly reviewRequiredItems: number;
  readonly confidenceObservations: Readonly<Record<ExtractionConfidence, number>>;
  readonly abstentions: number;
  readonly unparsedDocuments: number;
  readonly incompleteCoreDocuments: number;
  readonly identityConflicts: number;
}

export interface CorpusIntelligenceReport {
  readonly organizationId: string;
  readonly sourceType: DocumentSource["sourceType"];
  readonly sourceId: string;
  readonly corpusFingerprint: string;
  readonly documents: readonly CorpusDocumentResult[];
  readonly identityClusters: readonly IdentityClusterProposal[];
  readonly relationships: DocumentRelationshipReport;
  readonly summary: CorpusSummary;
  readonly scalability: { readonly relationshipComparisonComplexity: "O(n²)"; readonly warningThreshold: number; readonly warning: string | null };
}

const allObservedCandidates = (u: StructuredDocumentUnderstanding): readonly ObservedCandidate<unknown>[] => [
  u.documentType, u.pointOfSale, u.invoiceNumber, ...u.dates, u.fiscalAuthorizationId, u.issuerTaxId, u.customerTaxId,
  u.issuerName, u.customerName, u.issuerAddress, u.customerAddress, u.currency, u.subtotalCents, ...u.taxComponents,
  u.documentedNominalTotalCents, u.description, u.servicePeriodStart, u.servicePeriodEnd, u.quotationReference, u.installmentStage,
];

const coreComplete = (u?: StructuredDocumentUnderstanding): boolean => Boolean(u
  && u.invoiceNumber.normalized
  && u.dates.some((candidate) => candidate.semantic === "ISSUE_DATE" && candidate.normalized)
  && u.customerTaxId.normalized
  && u.currency.normalized
  && u.documentedNominalTotalCents.normalized !== null);

export class CorpusProcessor {
  constructor(private readonly provider: DocumentUnderstandingProvider) {}

  async processIncremental(source: DocumentSource, previous?: SourceCheckpoint, entityCatalog: readonly EntityCatalogEntry[] = []): Promise<IncrementalCorpusRun> {
    const { IncrementalCorpusProcessor } = await import("./incremental-corpus-processor");
    return new IncrementalCorpusProcessor(this.provider).process(source, previous, entityCatalog);
  }

  async process(source: DocumentSource, entityCatalog: readonly EntityCatalogEntry[] = []): Promise<CorpusIntelligenceReport> {
    const discovered = await source.discover();
    const loaded = await Promise.all(discovered.map(async (document) => {
      const bytes = await document.readContent();
      const fingerprintSha256 = createHash("sha256").update(bytes).digest("hex");
      return { document, bytes, fingerprintSha256 };
    }));
    const corpusFingerprint = createHash("sha256").update(loaded.map(({ document, fingerprintSha256 }) => `${document.sourceDocumentId}:${fingerprintSha256}`).sort().join("\n")).digest("hex");
    const imported = await this.provider.understand({
      organizationId: source.organizationId,
      idempotencyKey: `corpus:${source.sourceType}:${source.sourceId}:${corpusFingerprint}`,
      documents: loaded.map(({ document, bytes }) => ({ id: document.sourceDocumentId, organizationId: source.organizationId, fileName: document.displayName, declaredMediaType: document.mimeType, bytes })),
      entityCatalog,
    });
    const parseById = new Map(imported.results.map((result) => [result.documentId, result]));
    const documents = loaded.map(({ document, fingerprintSha256 }) => {
      const parse = parseById.get(document.sourceDocumentId)!;
      const sourceRecord: CorpusSourceRecord = { sourceDocumentId: document.sourceDocumentId, displayName: document.displayName, mimeType: document.mimeType, size: document.size, modifiedAt: document.modifiedAt, fingerprintSha256, supported: document.supported, provenance: document.provenance };
      return { source: sourceRecord, classification: classifyCorpusDocument(parse.understanding), parse };
    });
    const cohortDocuments: CohortDocument[] = documents.flatMap(({ source: item, parse }) => parse.understanding ? [{ documentId: item.sourceDocumentId, understanding: parse.understanding }] : []);
    const relationships = proposeDocumentRelationships(cohortDocuments);
    const signals: CustomerIdentitySignal[] = cohortDocuments.map(({ documentId, understanding }) => ({
      sourceRef: documentId, taxId: understanding.customerTaxId.normalized, normalizedName: understanding.customerName.normalized,
      normalizedAddress: understanding.customerAddress.normalized,
      evidence: understanding.customerTaxId.raw ? [{ documentId, location: { kind: "PDF_TEXT", page: 1 }, rawValue: understanding.customerTaxId.raw }] : [],
    }));
    const identityClusters = proposeCustomerIdentityClusters(signals);
    const confidenceObservations: Record<ExtractionConfidence, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, UNAVAILABLE: 0 };
    for (const { parse } of documents) if (parse.understanding) for (const candidate of allObservedCandidates(parse.understanding)) confidenceObservations[candidate.confidence] += 1;
    const contradictions = relationships.proposals.filter(({ status }) => status === "CONTRADICTED").length + identityClusters.filter(({ status }) => status === "CONTRADICTED").length;
    const unresolvedIdentities = identityClusters.filter(({ status }) => status === "UNKNOWN" || status === "AMBIGUOUS").length;
    const summary: CorpusSummary = {
      documentsWithResult: documents.length,
      documentsProcessed: documents.filter(({ parse }) => parse.status === "PARSED" || parse.status === "REVIEW_REQUIRED").length,
      documentsUnsupported: documents.filter(({ parse }) => parse.status === "UNSUPPORTED").length,
      documentsClassifiedAsInvoice: documents.filter(({ classification }) => classification === "INVOICE").length,
      unknownDocuments: documents.filter(({ classification }) => classification === "UNKNOWN_DOCUMENT").length,
      exactDuplicates: imported.duplicateFindings.filter(({ kind }) => kind === "EXACT_DOCUMENT_DUPLICATE").length,
      possibleDuplicates: imported.duplicateFindings.filter(({ kind }) => kind === "POSSIBLE_BUSINESS_DUPLICATE").length,
      identityClusters: identityClusters.length,
      unresolvedIdentities,
      relationshipProposals: relationships.proposals.length,
      contradictions,
      reviewRequiredItems: documents.filter(({ parse }) => parse.status === "REVIEW_REQUIRED").length + relationships.proposals.filter(({ reviewRequired }) => reviewRequired).length + identityClusters.filter(({ reviewRequired }) => reviewRequired).length,
      confidenceObservations,
      abstentions: documents.filter(({ classification }) => classification === "UNKNOWN_DOCUMENT").length + relationships.unmatchedSignals.length + unresolvedIdentities,
      unparsedDocuments: documents.filter(({ parse }) => parse.status === "FAILED").length,
      incompleteCoreDocuments: documents.filter(({ parse }) => parse.understanding && !coreComplete(parse.understanding)).length,
      identityConflicts: identityClusters.filter(({ status }) => status === "CONTRADICTED").length,
    };
    return {
      organizationId: source.organizationId, sourceType: source.sourceType, sourceId: source.sourceId, corpusFingerprint,
      documents, identityClusters, relationships, summary,
      scalability: { relationshipComparisonComplexity: "O(n²)", warningThreshold: 1_000, warning: documents.length >= 1_000 ? "Pairwise relationship analysis should be blocked by strong identity keys before larger production corpora." : null },
    };
  }
}
