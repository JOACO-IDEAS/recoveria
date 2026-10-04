import type { ComparisonArtifact, ComparisonStatus, DocumentComparison } from "./independent-comparison";
import type { DocumentGroundTruth, DocumentProposal, ReviewableFieldName } from "./ground-truth-types";
import type { IndependentDocumentVerification, IndependentVerificationArtifact, VerificationFieldName } from "./independent-verification-types";

export const REVIEW_WORKSPACE_SCHEMA_VERSION = "phase-8b2a-workspace-v1";
export const REQUIRED_VERIFICATION_CONTRACT = "phase-8b2a-v1";
export const REQUIRED_COMPARISON_CONTRACT = "phase-8b2a-v1";

const VERIFIER_FIELD: Partial<Record<ReviewableFieldName | "servicePeriod", VerificationFieldName>> = {
  invoiceNumber: "invoiceNumber", invoiceDate: "issueDate", dueDate: "documentedDueDate", amountCents: "nominalAmount", currency: "currency", issuer: "issuer", billedParty: "billedCustomer", administration: "administration", building: "building", servicePeriod: "servicePeriod",
};

export type WorkspaceFieldName = ReviewableFieldName | "servicePeriod";
export type WorkspaceSemanticStatus = ComparisonStatus | "NOT_COMPARABLE" | "MISSING_VERIFIER_OBSERVATION" | "MISSING_COMPARISON";

export interface WorkspaceField {
  readonly proposal: DocumentProposal["fields"][ReviewableFieldName] | null;
  readonly observation: IndependentDocumentVerification["fields"][VerificationFieldName] | null;
  readonly comparison: DocumentComparison["fields"][keyof DocumentComparison["fields"]] | null;
  readonly semanticStatus: WorkspaceSemanticStatus;
}

export interface WorkspaceDocument {
  readonly proposal: DocumentProposal;
  readonly independentVerification: IndependentDocumentVerification;
  readonly comparison: DocumentComparison;
  readonly groundTruth: DocumentGroundTruth;
  readonly workspaceFields: Readonly<Record<WorkspaceFieldName, WorkspaceField>>;
}

export interface WorkspaceSummary {
  readonly comparable: number; readonly matches: number; readonly absentAgreement: number; readonly disagreements: number; readonly ambiguous: number; readonly humanReviewRequired: number; readonly notComparable: number; readonly autoVerifiable: number; readonly humanRequired: number; readonly estimatedManualWorkReduction: number;
}

export function assertWorkspaceArtifactVersions(verification: IndependentVerificationArtifact, comparison: ComparisonArtifact): void {
  if (verification.schemaVersion !== 1 || verification.verifierContractVersion !== REQUIRED_VERIFICATION_CONTRACT) throw new Error("REVIEW_WORKSPACE_VERIFICATION_SCHEMA_MISMATCH");
  if (comparison.schemaVersion !== 1 || comparison.comparisonContractVersion !== REQUIRED_COMPARISON_CONTRACT) throw new Error("REVIEW_WORKSPACE_COMPARISON_SCHEMA_MISMATCH");
}

export function buildWorkspaceDocument(proposal: DocumentProposal, verification: IndependentDocumentVerification | undefined, comparison: DocumentComparison | undefined, groundTruth: DocumentGroundTruth | undefined): WorkspaceDocument {
  if (!verification || verification.documentId !== proposal.privateSafeDocumentId) throw new Error(`REVIEW_WORKSPACE_VERIFICATION_MISSING:${proposal.privateSafeDocumentId}`);
  if (!comparison || comparison.documentId !== proposal.privateSafeDocumentId) throw new Error(`REVIEW_WORKSPACE_COMPARISON_MISSING:${proposal.privateSafeDocumentId}`);
  if (!groundTruth) throw new Error(`REVIEW_WORKSPACE_GROUND_TRUTH_MISSING:${proposal.privateSafeDocumentId}`);
  const fieldNames: WorkspaceFieldName[] = [...Object.keys(proposal.fields) as ReviewableFieldName[], "servicePeriod"];
  const workspaceFields = Object.fromEntries(fieldNames.map((fieldName) => {
    const verifierField = VERIFIER_FIELD[fieldName];
    const observation = verifierField ? verification.fields[verifierField] ?? null : null;
    const fieldComparison = verifierField && verifierField !== "servicePeriod" ? comparison.fields[verifierField as keyof typeof comparison.fields] ?? null : null;
    const semanticStatus: WorkspaceSemanticStatus = !verifierField ? "NOT_COMPARABLE" : !observation ? "MISSING_VERIFIER_OBSERVATION" : verifierField === "servicePeriod" ? "NOT_COMPARABLE" : !fieldComparison ? "MISSING_COMPARISON" : fieldComparison.status;
    return [fieldName, { proposal: fieldName === "servicePeriod" ? null : proposal.fields[fieldName], observation, comparison: fieldComparison, semanticStatus }];
  })) as Record<WorkspaceFieldName, WorkspaceField>;
  return { proposal, independentVerification: verification, comparison, groundTruth, workspaceFields };
}

export function summarizeWorkspace(documents: readonly WorkspaceDocument[]): WorkspaceSummary {
  const statuses = documents.flatMap((document) => Object.values(document.workspaceFields).map((field) => field.semanticStatus)).filter((status) => status !== "NOT_COMPARABLE");
  const matches = statuses.filter((status) => status === "AUTO_VERIFIED_MATCH").length;
  const absentAgreement = statuses.filter((status) => status === "AUTO_VERIFIED_ABSENT").length;
  const disagreements = statuses.filter((status) => status === "DISAGREEMENT").length;
  const ambiguous = statuses.filter((status) => status === "AMBIGUOUS").length;
  const humanReviewRequired = statuses.filter((status) => status === "HUMAN_REVIEW").length;
  const notComparable = statuses.filter((status) => status === "MISSING_VERIFIER_OBSERVATION" || status === "MISSING_COMPARISON").length;
  const comparable = statuses.length - notComparable;
  const autoVerifiable = matches + absentAgreement;
  const humanRequired = disagreements + ambiguous + humanReviewRequired + notComparable;
  return { comparable, matches, absentAgreement, disagreements, ambiguous, humanReviewRequired, notComparable, autoVerifiable, humanRequired, estimatedManualWorkReduction: statuses.length ? autoVerifiable / statuses.length : 0 };
}

export function assertPersistedTotalsMatchWorkspace(persisted: ComparisonArtifact["totals"], summary: WorkspaceSummary): void {
  for (const key of ["comparable", "matches", "absentAgreement", "disagreements", "ambiguous", "humanReviewRequired", "autoVerifiable", "humanRequired", "estimatedManualWorkReduction"] as const) {
    if (persisted[key] !== summary[key]) throw new Error(`REVIEW_WORKSPACE_AGGREGATE_MISMATCH:${key}`);
  }
}
