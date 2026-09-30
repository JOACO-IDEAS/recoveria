import { createHash } from "node:crypto";
import { proposeCustomerIdentityClusters, type CustomerIdentitySignal, type IdentityClusterProposal } from "@/modules/entity-resolution/cohort-clustering";
import type { EntityCatalogEntry } from "./candidate-builder";
import { classifyCorpusDocument } from "./corpus-classification";
import type { CorpusDocumentResult, CorpusSourceRecord, CorpusSummary } from "./corpus-processor";
import { DuplicateDetector } from "./duplicate-detector";
import { assertCursorBoundary, isIncrementalDocumentSource, type DocumentSource, type SourceCursor } from "./document-source";
import type { DocumentUnderstandingProvider } from "./document-understanding-provider";
import { proposeDocumentRelationships, type CohortDocument } from "./document-relationships";
import { buildRelationshipCandidatePlan, type RelationshipCandidatePlan } from "./relationship-blocking";
import type { DocumentParseResult, DocumentRelationshipReport, ExtractionConfidence, ObservedCandidate, StructuredDocumentUnderstanding } from "./types";

export type SourceChangeKind = "NEW" | "UNCHANGED" | "CONTENT_CHANGED" | "PROCESSING_VERSION_CHANGED" | "LOCATOR_CHANGED" | "SAME_CONTENT_DIFFERENT_SOURCE_RECORD" | "REMOVED" | "FETCH_FAILED_RETRYABLE";
export type ProcessingOutcome = "SUCCEEDED" | "REVIEW_REQUIRED" | "UNSUPPORTED" | "FAILED_RETRYABLE" | "FAILED_TERMINAL";
export type CorpusFailureKind = "DISCOVERY_FAILURE" | "CONTENT_FETCH_FAILURE" | "UNDERSTANDING_FAILURE";

export interface SourceChange {
  readonly kind: SourceChangeKind;
  readonly sourceDocumentId: string;
  readonly priorSourceDocumentId?: string;
  readonly priorLocator?: string;
  readonly currentLocator?: string;
  readonly contentFingerprint?: string;
}

export interface CorpusProcessingFailure {
  readonly kind: CorpusFailureKind;
  readonly sourceDocumentId?: string;
  readonly retryable: boolean;
  readonly code: string;
}

export interface SourceCheckpointEntry {
  readonly source: CorpusSourceRecord;
  readonly parse: DocumentParseResult;
  readonly processingOutcome: ProcessingOutcome;
  readonly processingVersion: string;
  readonly lastObservedRevision: string;
}

export interface SourceCheckpoint {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly sourceType: DocumentSource["sourceType"];
  readonly sourceId: string;
  readonly revision: string;
  readonly cursor?: SourceCursor;
  readonly entries: readonly SourceCheckpointEntry[];
}

export interface IncrementalMetrics {
  readonly documentsDiscovered: number;
  readonly documentsUnderstood: number;
  readonly documentsReused: number;
  readonly documentsFailed: number;
  readonly candidatePairsBeforeBlocking: number;
  readonly candidatePairsAfterBlocking: number;
  readonly candidateReductionRatio: number;
  readonly fallbackAbstentions: number;
}

export interface IncrementalCorpusReport {
  readonly organizationId: string;
  readonly sourceType: DocumentSource["sourceType"];
  readonly sourceId: string;
  readonly corpusFingerprint: string;
  readonly documents: readonly CorpusDocumentResult[];
  readonly identityClusters: readonly IdentityClusterProposal[];
  readonly relationships: DocumentRelationshipReport;
  readonly relationshipPlan: RelationshipCandidatePlan;
  readonly changes: readonly SourceChange[];
  readonly failures: readonly CorpusProcessingFailure[];
  readonly partialSuccess: boolean;
  readonly summary: CorpusSummary;
  readonly metrics: IncrementalMetrics;
}

export interface IncrementalCorpusRun { readonly report: IncrementalCorpusReport; readonly checkpoint: SourceCheckpoint }

const outcomeFor = (parse: DocumentParseResult): ProcessingOutcome => parse.status === "PARSED" ? "SUCCEEDED" : parse.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : parse.status === "UNSUPPORTED" ? "UNSUPPORTED" : parse.errorCode === "MALFORMED_DOCUMENT" ? "FAILED_TERMINAL" : "FAILED_RETRYABLE";
const sourceError = (error: unknown, fallbackCode: string): { retryable: boolean; code: string } => {
  const candidate = error as { readonly retryable?: unknown; readonly code?: unknown };
  return { retryable: typeof candidate?.retryable === "boolean" ? candidate.retryable : true, code: typeof candidate?.code === "string" ? candidate.code : fallbackCode };
};

const allObservedCandidates = (u: StructuredDocumentUnderstanding): readonly ObservedCandidate<unknown>[] => [u.documentType, u.pointOfSale, u.invoiceNumber, ...u.dates, u.fiscalAuthorizationId, u.issuerTaxId, u.customerTaxId, u.issuerName, u.customerName, u.issuerAddress, u.customerAddress, u.currency, u.subtotalCents, ...u.taxComponents, u.documentedNominalTotalCents, u.description, u.servicePeriodStart, u.servicePeriodEnd, u.quotationReference, u.installmentStage];
const coreComplete = (u?: StructuredDocumentUnderstanding): boolean => Boolean(u && u.invoiceNumber.normalized && u.dates.some((candidate) => candidate.semantic === "ISSUE_DATE" && candidate.normalized) && u.customerTaxId.normalized && u.currency.normalized && u.documentedNominalTotalCents.normalized !== null);

function summarize(documents: readonly CorpusDocumentResult[], duplicateFindings: readonly { kind: string }[], clusters: readonly IdentityClusterProposal[], relationships: DocumentRelationshipReport): CorpusSummary {
  const confidenceObservations: Record<ExtractionConfidence, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, UNAVAILABLE: 0 };
  for (const { parse } of documents) if (parse.understanding) for (const candidate of allObservedCandidates(parse.understanding)) confidenceObservations[candidate.confidence] += 1;
  const unresolved = clusters.filter(({ status }) => status === "UNKNOWN" || status === "AMBIGUOUS").length;
  return {
    documentsWithResult: documents.length, documentsProcessed: documents.filter(({ parse }) => parse.status === "PARSED" || parse.status === "REVIEW_REQUIRED").length,
    documentsUnsupported: documents.filter(({ parse }) => parse.status === "UNSUPPORTED").length, documentsClassifiedAsInvoice: documents.filter(({ classification }) => classification === "INVOICE").length,
    unknownDocuments: documents.filter(({ classification }) => classification === "UNKNOWN_DOCUMENT").length,
    exactDuplicates: duplicateFindings.filter(({ kind }) => kind === "EXACT_DOCUMENT_DUPLICATE").length, possibleDuplicates: duplicateFindings.filter(({ kind }) => kind === "POSSIBLE_BUSINESS_DUPLICATE").length,
    identityClusters: clusters.length, unresolvedIdentities: unresolved, relationshipProposals: relationships.proposals.length,
    contradictions: relationships.proposals.filter(({ status }) => status === "CONTRADICTED").length + clusters.filter(({ status }) => status === "CONTRADICTED").length,
    reviewRequiredItems: documents.filter(({ parse }) => parse.status === "REVIEW_REQUIRED").length + relationships.proposals.filter(({ reviewRequired }) => reviewRequired).length + clusters.filter(({ reviewRequired }) => reviewRequired).length,
    confidenceObservations, abstentions: documents.filter(({ classification }) => classification === "UNKNOWN_DOCUMENT").length + relationships.unmatchedSignals.length + unresolved,
    unparsedDocuments: documents.filter(({ parse }) => parse.status === "FAILED").length, incompleteCoreDocuments: documents.filter(({ parse }) => parse.understanding && !coreComplete(parse.understanding)).length,
    identityConflicts: clusters.filter(({ status }) => status === "CONTRADICTED").length,
  };
}

export class IncrementalCorpusProcessor {
  constructor(private readonly provider: DocumentUnderstandingProvider) {}
  get processingVersion(): string { return this.provider.processingVersion; }

  async process(source: DocumentSource, previous?: SourceCheckpoint, entityCatalog: readonly EntityCatalogEntry[] = []): Promise<IncrementalCorpusRun> {
    if (previous && (previous.organizationId !== source.organizationId || previous.sourceId !== source.sourceId || previous.sourceType !== source.sourceType)) throw new Error("CHECKPOINT_SOURCE_BOUNDARY_MISMATCH");
    if (previous?.cursor) assertCursorBoundary(source, previous.cursor);
    let discovered;
    try { discovered = await source.discover(); }
    catch (error) {
      const classified = sourceError(error, "SOURCE_DISCOVERY_FAILED");
      const failure: CorpusProcessingFailure = { kind: "DISCOVERY_FAILURE", ...classified };
      return this.#discoveryFailure(source, previous, failure);
    }
    const nextCursor = await this.#resolveAdvisoryCursor(source, previous?.cursor);
    const failures: CorpusProcessingFailure[] = [];
    const priorById = new Map(previous?.entries.map((entry) => [entry.source.sourceDocumentId, entry]) ?? []);
    const loaded: Array<{ document: (typeof discovered)[number]; bytes?: Uint8Array; fingerprint: string }> = [];
    for (const document of discovered) {
      const prior = priorById.get(document.sourceDocumentId);
      const metadataProvesUnchanged = Boolean(document.providerContentIdentity && prior?.source.providerContentIdentity === document.providerContentIdentity && prior.source.mimeType === document.mimeType && prior.source.size === document.size && prior.source.supported === document.supported && prior.processingVersion === this.provider.processingVersion && prior.processingOutcome !== "FAILED_RETRYABLE" && prior.processingOutcome !== "FAILED_TERMINAL");
      if (metadataProvesUnchanged) { loaded.push({ document, fingerprint: prior!.source.fingerprintSha256 }); continue; }
      try { const bytes = await document.readContent(); loaded.push({ document, bytes, fingerprint: createHash("sha256").update(bytes).digest("hex") }); }
      catch (error) { failures.push({ kind: "CONTENT_FETCH_FAILURE", sourceDocumentId: document.sourceDocumentId, ...sourceError(error, "SOURCE_CONTENT_FETCH_FAILED") }); }
    }
    const corpusFingerprint = createHash("sha256").update(loaded.map(({ document, fingerprint }) => `${document.sourceDocumentId}:${fingerprint}`).sort().join("\n")).digest("hex");
    const priorByFingerprint = new Map<string, SourceCheckpointEntry[]>();
    for (const entry of previous?.entries ?? []) priorByFingerprint.set(entry.source.fingerprintSha256, [...(priorByFingerprint.get(entry.source.fingerprintSha256) ?? []), entry]);
    const changes: SourceChange[] = [];
    const reused = new Map<string, SourceCheckpointEntry>();
    const toUnderstand = [] as typeof loaded;
    for (const item of loaded) {
      const prior = priorById.get(item.document.sourceDocumentId);
      const currentLocator = item.document.provenance.locator;
      if (prior && prior.source.fingerprintSha256 === item.fingerprint && prior.processingVersion === this.provider.processingVersion && prior.processingOutcome !== "FAILED_RETRYABLE" && prior.processingOutcome !== "FAILED_TERMINAL") {
        const kind = prior.source.provenance.locator === currentLocator ? "UNCHANGED" : "LOCATOR_CHANGED";
        changes.push({ kind, sourceDocumentId: item.document.sourceDocumentId, priorLocator: prior.source.provenance.locator, currentLocator, contentFingerprint: item.fingerprint }); reused.set(item.document.sourceDocumentId, prior);
      } else {
        const sameContent = priorByFingerprint.get(item.fingerprint)?.find((entry) => entry.source.sourceDocumentId !== item.document.sourceDocumentId);
        const kind: SourceChangeKind = prior?.source.fingerprintSha256 === item.fingerprint && prior.processingVersion !== this.provider.processingVersion
          ? "PROCESSING_VERSION_CHANGED"
          : prior ? "CONTENT_CHANGED" : sameContent ? "SAME_CONTENT_DIFFERENT_SOURCE_RECORD" : "NEW";
        changes.push({ kind, sourceDocumentId: item.document.sourceDocumentId, priorSourceDocumentId: sameContent?.source.sourceDocumentId, priorLocator: prior?.source.provenance.locator ?? sameContent?.source.provenance.locator, currentLocator, contentFingerprint: item.fingerprint }); toUnderstand.push(item);
      }
    }
    const currentIds = new Set(discovered.map(({ sourceDocumentId }) => sourceDocumentId));
    for (const entry of previous?.entries ?? []) if (!currentIds.has(entry.source.sourceDocumentId)) changes.push({ kind: "REMOVED", sourceDocumentId: entry.source.sourceDocumentId, priorLocator: entry.source.provenance.locator, contentFingerprint: entry.source.fingerprintSha256 });
    for (const failure of failures) changes.push({ kind: "FETCH_FAILED_RETRYABLE", sourceDocumentId: failure.sourceDocumentId!, priorLocator: priorById.get(failure.sourceDocumentId!)?.source.provenance.locator, currentLocator: discovered.find(({ sourceDocumentId }) => sourceDocumentId === failure.sourceDocumentId)?.provenance.locator });

    const parsed = new Map<string, DocumentParseResult>();
    if (toUnderstand.length) {
      try {
        const result = await this.provider.understand({ organizationId: source.organizationId, idempotencyKey: `incremental:${source.sourceType}:${source.sourceId}:${corpusFingerprint}`, documents: toUnderstand.map(({ document, bytes }) => ({ id: document.sourceDocumentId, organizationId: source.organizationId, fileName: document.displayName, declaredMediaType: document.mimeType, bytes: bytes! })), entityCatalog });
        for (const parse of result.results) { parsed.set(parse.documentId, parse); if (parse.status === "FAILED") failures.push({ kind: "UNDERSTANDING_FAILURE", sourceDocumentId: parse.documentId, retryable: parse.errorCode !== "MALFORMED_DOCUMENT", code: parse.errorCode ?? "DOCUMENT_UNDERSTANDING_FAILED" }); }
      } catch { for (const { document } of toUnderstand) failures.push({ kind: "UNDERSTANDING_FAILURE", sourceDocumentId: document.sourceDocumentId, retryable: true, code: "PROVIDER_BATCH_FAILED" }); }
    }
    const documents: CorpusDocumentResult[] = [];
    const checkpointEntries: SourceCheckpointEntry[] = [];
    const duplicateDetector = new DuplicateDetector(); const duplicateFindings = [];
    for (const item of loaded) {
      const prior = reused.get(item.document.sourceDocumentId); const parse = prior?.parse ?? parsed.get(item.document.sourceDocumentId);
      if (!parse) continue;
      const sourceRecord: CorpusSourceRecord = { sourceDocumentId: item.document.sourceDocumentId, displayName: item.document.displayName, mimeType: item.document.mimeType, size: item.document.size, modifiedAt: item.document.modifiedAt, providerContentIdentity: item.document.providerContentIdentity, fingerprintSha256: item.fingerprint, supported: item.document.supported, provenance: item.document.provenance };
      documents.push({ source: sourceRecord, classification: classifyCorpusDocument(parse.understanding), parse }); duplicateFindings.push(...duplicateDetector.inspectFingerprint({ id: item.document.sourceDocumentId, organizationId: source.organizationId, fingerprintSha256: item.fingerprint }, parse.candidates));
      checkpointEntries.push({ source: sourceRecord, parse, processingOutcome: outcomeFor(parse), processingVersion: this.provider.processingVersion, lastObservedRevision: corpusFingerprint });
    }
    // A transient fetch failure does not erase the last trusted result. It is
    // retained as stale/retryable evidence and never reported as fresh success.
    for (const failure of failures.filter(({ kind }) => kind === "CONTENT_FETCH_FAILURE")) {
      const prior = priorById.get(failure.sourceDocumentId!); if (prior && !checkpointEntries.some(({ source: item }) => item.sourceDocumentId === failure.sourceDocumentId)) checkpointEntries.push(prior);
    }
    const cohort: CohortDocument[] = documents.flatMap(({ source: item, parse }) => parse.understanding ? [{ documentId: item.sourceDocumentId, understanding: parse.understanding }] : []);
    const relationshipPlan = buildRelationshipCandidatePlan(cohort); const relationships = proposeDocumentRelationships(cohort, relationshipPlan.pairs);
    const signals: CustomerIdentitySignal[] = cohort.map(({ documentId, understanding }) => ({ sourceRef: documentId, taxId: understanding.customerTaxId.normalized, normalizedName: understanding.customerName.normalized, normalizedAddress: understanding.customerAddress.normalized, evidence: understanding.customerTaxId.raw ? [{ documentId, location: { kind: "PDF_TEXT", page: 1 }, rawValue: understanding.customerTaxId.raw }] : [] }));
    const identityClusters = proposeCustomerIdentityClusters(signals); const summary = summarize(documents, duplicateFindings, identityClusters, relationships);
    const checkpoint: SourceCheckpoint = { schemaVersion: 1, organizationId: source.organizationId, sourceType: source.sourceType, sourceId: source.sourceId, revision: corpusFingerprint, cursor: failures.length === 0 ? nextCursor : undefined, entries: checkpointEntries };
    return { report: { organizationId: source.organizationId, sourceType: source.sourceType, sourceId: source.sourceId, corpusFingerprint, documents, identityClusters, relationships, relationshipPlan, changes, failures, partialSuccess: failures.length > 0 && documents.length > 0, summary, metrics: { documentsDiscovered: discovered.length, documentsUnderstood: toUnderstand.length, documentsReused: reused.size, documentsFailed: failures.length, candidatePairsBeforeBlocking: relationshipPlan.pairsBeforeBlocking, candidatePairsAfterBlocking: relationshipPlan.pairsAfterBlocking, candidateReductionRatio: relationshipPlan.reductionRatio, fallbackAbstentions: relationshipPlan.fallbackAbstentions } }, checkpoint };
  }

  async #resolveAdvisoryCursor(source: DocumentSource, previousCursor?: SourceCursor): Promise<SourceCursor | undefined> {
    if (!isIncrementalDocumentSource(source)) return undefined;
    if (previousCursor) {
      try {
        const changes = await source.discoverChanges(previousCursor);
        // Change sets remain advisory; authoritative discovery already succeeded.
        if (changes.status === "VALID" && changes.nextCursor) { assertCursorBoundary(source, changes.nextCursor); return changes.nextCursor; }
      } catch { /* Fall through to a fresh cursor. */ }
    }
    try { const cursor = await source.currentCursor(); assertCursorBoundary(source, cursor); return cursor; }
    catch { return undefined; }
  }

  #discoveryFailure(source: DocumentSource, previous: SourceCheckpoint | undefined, failure: CorpusProcessingFailure): IncrementalCorpusRun {
    const documents = (previous?.entries ?? []).map(({ source: item, parse }) => ({ source: item, classification: classifyCorpusDocument(parse.understanding), parse }));
    const cohort: CohortDocument[] = documents.flatMap(({ source: item, parse }) => parse.understanding ? [{ documentId: item.sourceDocumentId, understanding: parse.understanding }] : []);
    const plan = buildRelationshipCandidatePlan(cohort); const relationships = proposeDocumentRelationships(cohort, plan.pairs);
    const signals: CustomerIdentitySignal[] = cohort.map(({ documentId, understanding }) => ({ sourceRef: documentId, taxId: understanding.customerTaxId.normalized, normalizedName: understanding.customerName.normalized, normalizedAddress: understanding.customerAddress.normalized, evidence: understanding.customerTaxId.raw ? [{ documentId, location: { kind: "PDF_TEXT", page: 1 }, rawValue: understanding.customerTaxId.raw }] : [] }));
    const identityClusters = proposeCustomerIdentityClusters(signals); const summary = summarize(documents, [], identityClusters, relationships);
    const checkpoint = previous ?? { schemaVersion: 1 as const, organizationId: source.organizationId, sourceType: source.sourceType, sourceId: source.sourceId, revision: "unobserved", entries: [] };
    return { report: { organizationId: source.organizationId, sourceType: source.sourceType, sourceId: source.sourceId, corpusFingerprint: checkpoint.revision, documents, identityClusters, relationships, relationshipPlan: plan, changes: [], failures: [failure], partialSuccess: documents.length > 0, summary, metrics: { documentsDiscovered: 0, documentsUnderstood: 0, documentsReused: documents.length, documentsFailed: 1, candidatePairsBeforeBlocking: plan.pairsBeforeBlocking, candidatePairsAfterBlocking: plan.pairsAfterBlocking, candidateReductionRatio: plan.reductionRatio, fallbackAbstentions: plan.fallbackAbstentions } }, checkpoint };
  }
}
