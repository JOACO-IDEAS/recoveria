import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DocumentSourceType } from "./document-source";
import type { SourceCheckpoint } from "./incremental-corpus-processor";

export const SOURCE_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export interface SourceCheckpointKey {
  readonly organizationId: string;
  readonly sourceType: DocumentSourceType;
  readonly sourceId: string;
}

export type CheckpointLoadResult =
  | { readonly status: "MISSING" | "INVALIDATED" }
  | { readonly status: "FOUND"; readonly checkpoint: SourceCheckpoint };

export interface SourceCheckpointStore {
  load(key: SourceCheckpointKey): Promise<CheckpointLoadResult>;
  /** Replaces the prior value as one atomic logical operation. */
  save(key: SourceCheckpointKey, checkpoint: SourceCheckpoint): Promise<void>;
}

function boundaryMatches(key: SourceCheckpointKey, checkpoint: SourceCheckpoint): boolean {
  return checkpoint.organizationId === key.organizationId && checkpoint.sourceType === key.sourceType && checkpoint.sourceId === key.sourceId;
}

function structurallyValid(key: SourceCheckpointKey, checkpoint: SourceCheckpoint): boolean {
  if (checkpoint.schemaVersion !== SOURCE_CHECKPOINT_SCHEMA_VERSION || !boundaryMatches(key, checkpoint) || typeof checkpoint.revision !== "string" || !Array.isArray(checkpoint.entries)) return false;
  if (checkpoint.cursor && (checkpoint.cursor.organizationId !== key.organizationId || checkpoint.cursor.sourceType !== key.sourceType || checkpoint.cursor.sourceId !== key.sourceId || typeof checkpoint.cursor.value !== "string")) return false;
  return checkpoint.entries.every((entry) => typeof entry.processingVersion === "string" && typeof entry.source?.sourceDocumentId === "string"
    && entry.source.provenance?.sourceType === key.sourceType && entry.source.provenance?.sourceId === key.sourceId
    && entry.source.provenance?.sourceDocumentId === entry.source.sourceDocumentId);
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)]));
  return value;
}

export function serializeSourceCheckpoint(checkpoint: SourceCheckpoint): string {
  return `${JSON.stringify(sorted(checkpoint))}\n`;
}

export function deserializeSourceCheckpoint(serialized: string, key: SourceCheckpointKey): CheckpointLoadResult {
  try {
    const candidate = JSON.parse(serialized) as SourceCheckpoint;
    if (!structurallyValid(key, candidate)) return { status: "INVALIDATED" };
    return { status: "FOUND", checkpoint: candidate };
  } catch { return { status: "INVALIDATED" }; }
}

/** Non-production file store. A same-directory rename supplies atomic replacement. */
export class LocalFileSourceCheckpointStore implements SourceCheckpointStore {
  constructor(private readonly directory: string) {}

  #path(key: SourceCheckpointKey): string {
    const digest = createHash("sha256").update(`${key.organizationId}\0${key.sourceType}\0${key.sourceId}`).digest("hex");
    return join(this.directory, `${digest}.checkpoint.json`);
  }

  async load(key: SourceCheckpointKey): Promise<CheckpointLoadResult> {
    try { return deserializeSourceCheckpoint(await readFile(this.#path(key), "utf8"), key); }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? { status: "MISSING" } : { status: "INVALIDATED" }; }
  }

  async save(key: SourceCheckpointKey, checkpoint: SourceCheckpoint): Promise<void> {
    if (!structurallyValid(key, checkpoint)) throw new Error("CHECKPOINT_SOURCE_BOUNDARY_MISMATCH");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = this.#path(key); const temporary = `${target}.tmp`;
    await writeFile(temporary, serializeSourceCheckpoint(checkpoint), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }
}
