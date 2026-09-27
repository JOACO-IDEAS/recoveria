import { proposeCustomerIdentityClusters, type CustomerIdentitySignal } from "@/modules/entity-resolution/cohort-clustering";
import { classifyCorpusDocument } from "@/modules/ingestion/corpus-classification";
import { proposeDocumentRelationships, type CohortDocument } from "@/modules/ingestion/document-relationships";
import type { SourceCheckpoint, SourceCheckpointEntry } from "@/modules/ingestion/incremental-corpus-processor";
import { buildRelationshipCandidatePlan } from "@/modules/ingestion/relationship-blocking";
import type { VersionedSourceCheckpoint } from "@/modules/ingestion/production-source-checkpoint-port";
import type { DocumentObservation, EvidenceClassification, ExtractionConfidence, InvoiceCandidate, ObservedCandidate, SemanticDateCandidate, StructuredDocumentUnderstanding } from "@/modules/ingestion/types";
import type {
  ProductSurfaceDateField,
  ProductSurfaceDuplicateStatus,
  ProductSurfaceEvidenceField,
  ProductSurfaceEvidenceReadModel,
  ProductSurfaceField,
  ProductSurfaceInvoiceFilters,
  ProductSurfaceInvoiceReadModel,
  ProductSurfaceRelationshipReadModel,
  ProductSurfaceRelationshipSummary,
  ProductSurfaceScope,
} from "./types";

export interface ProductSurfaceCheckpointReader {
  load(scope: ProductSurfaceScope): Promise<VersionedSourceCheckpoint | null>;
}

interface ReconstructedIntelligence {
  readonly duplicates: ReadonlyMap<string, ProductSurfaceDuplicateStatus>;
  readonly relationships: ReturnType<typeof proposeDocumentRelationships>;
  readonly clusters: ReturnType<typeof proposeCustomerIdentityClusters>;
}

const unavailable = <T>(): ProductSurfaceField<T> => ({ value: null, status: "MISSING", classification: "UNKNOWN", confidence: "UNAVAILABLE", evidenceAvailable: false, evidenceCount: 0 });

function field<T>(candidate?: ObservedCandidate<T>): ProductSurfaceField<T> {
  if (!candidate) return unavailable<T>();
  return {
    value: candidate.normalized,
    status: candidate.status,
    classification: candidate.classification,
    confidence: candidate.confidence,
    evidenceAvailable: candidate.observationIds.length > 0,
    evidenceCount: candidate.observationIds.length,
  };
}

function dateField(understanding: StructuredDocumentUnderstanding | undefined, semantic: SemanticDateCandidate["semantic"]): ProductSurfaceDateField {
  const candidate = understanding?.dates.find((item) => item.semantic === semantic);
  return { ...field(candidate), semantic };
}

function businessKey(candidate: InvoiceCandidate): string | null {
  const parts = [candidate.issuer.normalized, candidate.invoiceNumber.normalized, candidate.invoiceDate.normalized, candidate.amountCents.normalized, candidate.currency.normalized];
  return parts.every((part) => part !== null && part !== "") ? parts.join("\u0000") : null;
}

function reconstructDuplicates(entries: readonly SourceCheckpointEntry[]): ReadonlyMap<string, ProductSurfaceDuplicateStatus> {
  const result = new Map<string, ProductSurfaceDuplicateStatus>(entries.map(({ source }) => [source.sourceDocumentId, "NONE"]));
  const fingerprints = new Map<string, string>();
  const businessKeys = new Map<string, string>();
  for (const entry of [...entries].sort((a, b) => a.source.sourceDocumentId.localeCompare(b.source.sourceDocumentId))) {
    const id = entry.source.sourceDocumentId;
    const exact = fingerprints.get(entry.source.fingerprintSha256);
    if (exact) result.set(id, "EXACT_DOCUMENT_DUPLICATE");
    else fingerprints.set(entry.source.fingerprintSha256, id);
    for (const candidate of entry.parse.candidates) {
      const key = businessKey(candidate);
      if (!key) continue;
      const existing = businessKeys.get(key);
      if (existing && existing !== id && result.get(id) !== "EXACT_DOCUMENT_DUPLICATE") result.set(id, "POSSIBLE_BUSINESS_DUPLICATE");
      else if (!existing) businessKeys.set(key, id);
    }
  }
  return result;
}

function reconstruct(checkpoint: SourceCheckpoint): ReconstructedIntelligence {
  const cohort: CohortDocument[] = checkpoint.entries.flatMap(({ source, parse }) => parse.understanding ? [{ documentId: source.sourceDocumentId, understanding: parse.understanding }] : []);
  const plan = buildRelationshipCandidatePlan(cohort);
  const relationships = proposeDocumentRelationships(cohort, plan.pairs);
  const signals: CustomerIdentitySignal[] = cohort.map(({ documentId, understanding }) => ({
    sourceRef: documentId,
    taxId: understanding.customerTaxId.normalized,
    normalizedName: understanding.customerName.normalized,
    normalizedAddress: understanding.customerAddress.normalized,
    evidence: [],
  }));
  return { duplicates: reconstructDuplicates(checkpoint.entries), relationships, clusters: proposeCustomerIdentityClusters(signals) };
}

function relationshipSummary(documentId: string, intelligence: ReconstructedIntelligence): ProductSurfaceRelationshipSummary {
  const proposals = intelligence.relationships.proposals.filter(({ documentIds }) => documentIds.includes(documentId));
  const unmatched = intelligence.relationships.unmatchedSignals.filter((item) => item.documentId === documentId);
  return {
    proposalCount: proposals.length,
    reviewRequiredCount: proposals.filter(({ reviewRequired }) => reviewRequired).length,
    contradictionCount: proposals.filter(({ status }) => status === "CONTRADICTED").length,
    unmatchedSignalCount: unmatched.length,
  };
}

const confidenceRank: Readonly<Record<ExtractionConfidence, number>> = { UNAVAILABLE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
function confidenceSummary(fields: readonly ProductSurfaceField<unknown>[]): ExtractionConfidence {
  const available = fields.map(({ confidence }) => confidence).filter((value) => value !== "UNAVAILABLE");
  return available.sort((a, b) => confidenceRank[a] - confidenceRank[b])[0] ?? "UNAVAILABLE";
}

function classificationSummary(fields: readonly ProductSurfaceField<unknown>[]): Readonly<Record<EvidenceClassification, number>> {
  const result: Record<EvidenceClassification, number> = { FACT: 0, INFERENCE: 0, UNKNOWN: 0 };
  for (const item of fields) result[item.classification] += 1;
  return result;
}

function toInvoice(entry: SourceCheckpointEntry, intelligence: ReconstructedIntelligence): ProductSurfaceInvoiceReadModel {
  const understanding = entry.parse.understanding;
  const invoiceNumber = field(understanding?.invoiceNumber);
  const issueDate = dateField(understanding, "ISSUE_DATE");
  const documentedDueDate = dateField(understanding, "PAYMENT_DUE_DATE");
  const documentedNominalTotalCents = field(understanding?.documentedNominalTotalCents);
  const currency = field(understanding?.currency);
  const entityCandidate = field(understanding?.customerName);
  const surfacedFields = [invoiceNumber, issueDate, documentedDueDate, documentedNominalTotalCents, currency, entityCandidate];
  const relationships = relationshipSummary(entry.source.sourceDocumentId, intelligence);
  const cluster = intelligence.clusters.find(({ memberSourceRefs }) => memberSourceRefs.includes(entry.source.sourceDocumentId));
  const duplicateStatus = intelligence.duplicates.get(entry.source.sourceDocumentId) ?? "NONE";
  const hasContradictions = relationships.contradictionCount > 0 || cluster?.status === "CONTRADICTED";
  const reasonCount = entry.parse.reviewReasons.length + relationships.reviewRequiredCount + relationships.unmatchedSignalCount + (cluster?.reviewRequired ? 1 : 0) + (duplicateStatus === "NONE" ? 0 : 1);
  return {
    documentId: entry.source.sourceDocumentId,
    source: { sourceType: entry.source.provenance.sourceType, displayName: entry.source.displayName, mimeType: entry.source.mimeType, modifiedAt: entry.source.modifiedAt ?? null },
    documentClassification: classifyCorpusDocument(understanding),
    parserStatus: entry.parse.status,
    invoiceNumber,
    issueDate,
    documentedDueDate,
    documentedNominalTotalCents,
    currency,
    entityCandidate,
    duplicateStatus,
    reviewStatus: { required: entry.parse.status === "REVIEW_REQUIRED" || reasonCount > 0 || hasContradictions, reasonCount, hasContradictions },
    confidenceSummary: confidenceSummary(surfacedFields),
    classificationSummary: classificationSummary(surfacedFields),
    provenanceAvailable: surfacedFields.some(({ evidenceAvailable }) => evidenceAvailable),
    relationships,
  };
}

function assertBoundary(scope: ProductSurfaceScope, record: VersionedSourceCheckpoint): void {
  const checkpoint = record.checkpoint;
  if (record.connectionId !== scope.connectionId || checkpoint.organizationId !== scope.organizationId || checkpoint.sourceType !== scope.sourceType || checkpoint.sourceId !== scope.sourceId) throw new Error("PRODUCT_SURFACE_SCOPE_MISMATCH");
  for (const entry of checkpoint.entries) if (entry.parse.organizationId !== scope.organizationId || entry.source.provenance.sourceType !== scope.sourceType || entry.source.provenance.sourceId !== scope.sourceId || entry.source.provenance.sourceDocumentId !== entry.source.sourceDocumentId) throw new Error("PRODUCT_SURFACE_ENTRY_SCOPE_MISMATCH");
}

function candidateFor(understanding: StructuredDocumentUnderstanding, selected: ProductSurfaceEvidenceField): ObservedCandidate<string | number> | SemanticDateCandidate {
  if (selected === "invoiceNumber") return understanding.invoiceNumber;
  if (selected === "issueDate") return understanding.dates.find(({ semantic }) => semantic === "ISSUE_DATE") ?? { raw: null, normalized: null, status: "MISSING", confidence: "UNAVAILABLE", classification: "UNKNOWN", observationIds: [], semantic: "ISSUE_DATE" };
  if (selected === "documentedDueDate") return understanding.dates.find(({ semantic }) => semantic === "PAYMENT_DUE_DATE") ?? { raw: null, normalized: null, status: "MISSING", confidence: "UNAVAILABLE", classification: "UNKNOWN", observationIds: [], semantic: "PAYMENT_DUE_DATE" };
  if (selected === "documentedNominalTotalCents") return understanding.documentedNominalTotalCents;
  if (selected === "currency") return understanding.currency;
  return understanding.customerName;
}

function evidenceObservations(candidate: ObservedCandidate<unknown>, observations: readonly DocumentObservation[]) {
  const byId = new Map(observations.map((item) => [item.id, item]));
  return candidate.observationIds.flatMap((id) => {
    const observation = byId.get(id);
    return observation ? [{ observationId: observation.id, page: observation.page, region: observation.region, excerpt: observation.observedText, extractionMethod: observation.extractionMethod, confidence: observation.confidence }] : [];
  });
}

function matchesFilters(invoice: ProductSurfaceInvoiceReadModel, filters: ProductSurfaceInvoiceFilters): boolean {
  const search = filters.search?.trim().toLocaleLowerCase();
  if (search && ![invoice.invoiceNumber.value, invoice.entityCandidate.value, invoice.source.displayName].some((value) => String(value ?? "").toLocaleLowerCase().includes(search))) return false;
  if (filters.issueDateFrom && (!invoice.issueDate.value || invoice.issueDate.value < filters.issueDateFrom)) return false;
  if (filters.issueDateTo && (!invoice.issueDate.value || invoice.issueDate.value > filters.issueDateTo)) return false;
  const amount = invoice.documentedNominalTotalCents.value;
  if (filters.documentedNominalTotalCentsMin !== undefined && (amount === null || amount < filters.documentedNominalTotalCentsMin)) return false;
  if (filters.documentedNominalTotalCentsMax !== undefined && (amount === null || amount > filters.documentedNominalTotalCentsMax)) return false;
  if (filters.entityCandidate && invoice.entityCandidate.value?.toLocaleLowerCase() !== filters.entityCandidate.toLocaleLowerCase()) return false;
  if (filters.confidence && invoice.confidenceSummary !== filters.confidence) return false;
  if (filters.reviewRequired !== undefined && invoice.reviewStatus.required !== filters.reviewRequired) return false;
  if (filters.duplicateStatus && invoice.duplicateStatus !== filters.duplicateStatus) return false;
  if (filters.classification && invoice.classificationSummary[filters.classification] === 0) return false;
  return true;
}

export class ProductSurfaceQueryService {
  constructor(private readonly checkpoints: ProductSurfaceCheckpointReader) {}

  async listInvoices(scope: ProductSurfaceScope, filters: ProductSurfaceInvoiceFilters = {}): Promise<readonly ProductSurfaceInvoiceReadModel[]> {
    const loaded = await this.#load(scope);
    if (!loaded) return [];
    const intelligence = reconstruct(loaded.checkpoint);
    return loaded.checkpoint.entries.map((entry) => toInvoice(entry, intelligence)).filter((invoice) => matchesFilters(invoice, filters)).sort((a, b) => a.documentId.localeCompare(b.documentId));
  }

  async getInvoice(scope: ProductSurfaceScope, documentId: string): Promise<ProductSurfaceInvoiceReadModel | null> {
    const loaded = await this.#load(scope);
    if (!loaded) return null;
    const entry = loaded.checkpoint.entries.find(({ source }) => source.sourceDocumentId === documentId);
    return entry ? toInvoice(entry, reconstruct(loaded.checkpoint)) : null;
  }

  async getEvidence(scope: ProductSurfaceScope, documentId: string, selected: ProductSurfaceEvidenceField): Promise<ProductSurfaceEvidenceReadModel | null> {
    const loaded = await this.#load(scope);
    if (!loaded) return null;
    const entry = loaded.checkpoint.entries.find(({ source }) => source.sourceDocumentId === documentId);
    const understanding = entry?.parse.understanding;
    if (!entry || !understanding) return null;
    const intelligence = reconstruct(loaded.checkpoint);
    const candidate = candidateFor(understanding, selected);
    const observations = evidenceObservations(candidate, understanding.observations);
    const contradictions = intelligence.relationships.proposals.filter(({ status, documentIds }) => status === "CONTRADICTED" && documentIds.includes(documentId)).map((proposal) => ({ kind: proposal.kind, relatedDocumentId: proposal.documentIds.find((id) => id !== documentId)!, signals: proposal.contradictingSignals }));
    return {
      documentId,
      source: { sourceType: entry.source.provenance.sourceType, displayName: entry.source.displayName },
      field: selected,
      value: candidate.normalized,
      status: candidate.status,
      classification: candidate.classification,
      confidence: candidate.confidence,
      observations,
      contradictions,
      technical: { parserVersions: [...new Set(observations.map(({ observationId }) => understanding.observations.find(({ id }) => id === observationId)!.parserVersion))].sort() },
    };
  }

  async getRelationships(scope: ProductSurfaceScope, documentId: string): Promise<ProductSurfaceRelationshipReadModel | null> {
    const loaded = await this.#load(scope);
    if (!loaded || !loaded.checkpoint.entries.some(({ source }) => source.sourceDocumentId === documentId)) return null;
    const intelligence = reconstruct(loaded.checkpoint);
    const proposals = intelligence.relationships.proposals.filter(({ documentIds }) => documentIds.includes(documentId)).map((proposal) => ({
      kind: proposal.kind,
      status: proposal.status,
      classification: proposal.classification,
      confidence: proposal.confidence,
      relatedDocumentId: proposal.documentIds.find((id) => id !== documentId)!,
      reviewRequired: proposal.reviewRequired,
      supportingSignals: proposal.supportingSignals,
      contradictingSignals: proposal.contradictingSignals,
    }));
    const unmatchedSignals = intelligence.relationships.unmatchedSignals.filter((item) => item.documentId === documentId).map((item) => ({ kind: item.signalKind, reason: item.reason }));
    return { documentId, summary: relationshipSummary(documentId, intelligence), proposals, unmatchedSignals };
  }

  async #load(scope: ProductSurfaceScope): Promise<VersionedSourceCheckpoint | null> {
    const loaded = await this.checkpoints.load(scope);
    if (loaded) assertBoundary(scope, loaded);
    return loaded;
  }
}
