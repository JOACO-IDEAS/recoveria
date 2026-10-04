import { readFile, writeFile } from "node:fs/promises";
import { REVIEWABLE_FIELD_NAMES, type DocumentGroundTruth, type DocumentProposal, type FieldLabel, type FieldLabelStatus, type GroundTruthStore, type ReviewableFieldName } from "./ground-truth-types";

// Phase 8B.2: the ground-truth store is a layer entirely separate from
// pipeline extraction output (see knowledge/INVARIANTS.md's raw/normalized/
// confirmed separation). Nothing here ever reads from or writes into the
// ExtractedField/InvoiceImportCandidate tables -- it is a private, local
// JSON file that only a founder's explicit label ever changes.

export function emptyFieldLabel(): FieldLabel {
  return { status: "UNREVIEWED", correctedValue: null, note: null };
}

function emptyFieldLabels(): Record<ReviewableFieldName, FieldLabel> {
  return Object.fromEntries(REVIEWABLE_FIELD_NAMES.map((name) => [name, emptyFieldLabel()])) as Record<ReviewableFieldName, FieldLabel>;
}

// Never derives a label from the proposal itself -- every field starts
// UNREVIEWED regardless of what the pipeline proposed. This is the only
// function allowed to create ground-truth rows, and it never inspects
// `proposal.fields` beyond using the document identifier.
export function initializeGroundTruth(proposals: readonly DocumentProposal[]): GroundTruthStore {
  return Object.fromEntries(proposals.map((proposal) => [proposal.privateSafeDocumentId, {
    privateSafeDocumentId: proposal.privateSafeDocumentId,
    status: "UNREVIEWED" as const,
    reviewer: null,
    reviewedAt: null,
    fields: emptyFieldLabels(),
  } satisfies DocumentGroundTruth]));
}

// Merges newly-discovered documents into an existing store without ever
// touching or resetting an already-reviewed document's labels. Resumable:
// safe to call every time the exporter re-runs against the same 20 documents.
export function mergeNewDocuments(existing: GroundTruthStore, proposals: readonly DocumentProposal[]): GroundTruthStore {
  const additions = initializeGroundTruth(proposals.filter((proposal) => !existing[proposal.privateSafeDocumentId]));
  return { ...existing, ...additions };
}

export async function readGroundTruth(path: string): Promise<GroundTruthStore | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as GroundTruthStore;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeGroundTruth(path: string, store: GroundTruthStore): Promise<void> {
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export interface ApplyFieldLabelInput {
  readonly documentId: string;
  readonly fieldName: ReviewableFieldName;
  readonly status: FieldLabelStatus;
  readonly correctedValue?: string | null;
  readonly note?: string | null;
  readonly reviewer: string;
}

// The only function that changes an existing label -- always requires an
// explicit status + reviewer supplied by the caller (the review server,
// only ever in response to a founder's own HTTP request). Never inspects
// pipeline output to decide what to write.
export function applyFieldLabel(store: GroundTruthStore, input: ApplyFieldLabelInput, now: () => string = () => new Date().toISOString()): GroundTruthStore {
  const existing = store[input.documentId];
  if (!existing) throw new Error(`GROUND_TRUTH_UNKNOWN_DOCUMENT:${input.documentId}`);
  const updatedFields: Record<ReviewableFieldName, FieldLabel> = { ...existing.fields, [input.fieldName]: { status: input.status, correctedValue: input.correctedValue ?? null, note: input.note ?? null } };
  const statuses = REVIEWABLE_FIELD_NAMES.map((name) => updatedFields[name].status);
  const status = statuses.every((s) => s !== "UNREVIEWED") ? "COMPLETE" : statuses.some((s) => s !== "UNREVIEWED") ? "IN_PROGRESS" : "UNREVIEWED";
  return { ...store, [input.documentId]: { ...existing, fields: updatedFields, status, reviewer: input.reviewer, reviewedAt: now() } };
}
