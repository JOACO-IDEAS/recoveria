import type { SourceCheckpoint } from "./incremental-corpus-processor";
import type { SourceCheckpointKey } from "./source-checkpoint-store";

export interface VersionedSourceCheckpoint { readonly version: number; readonly connectionId: string; readonly checkpoint: SourceCheckpoint }
export interface ProductionSourceCheckpointPort {
  load(key: SourceCheckpointKey, connectionId: string): Promise<VersionedSourceCheckpoint | null>;
  saveAtomically(key: SourceCheckpointKey, connectionId: string, checkpoint: SourceCheckpoint, expectedVersion: number | null): Promise<VersionedSourceCheckpoint>;
}

/** Test-only optimistic-lock implementation of the future production boundary. */
export class InMemoryProductionSourceCheckpointStore implements ProductionSourceCheckpointPort {
  readonly #records = new Map<string, VersionedSourceCheckpoint>();
  #key(key: SourceCheckpointKey, connectionId: string): string { return `${key.organizationId}\0${key.sourceType}\0${key.sourceId}\0${connectionId}`; }
  async load(key: SourceCheckpointKey, connectionId: string): Promise<VersionedSourceCheckpoint | null> { return this.#records.get(this.#key(key, connectionId)) ?? null; }
  async saveAtomically(key: SourceCheckpointKey, connectionId: string, checkpoint: SourceCheckpoint, expectedVersion: number | null): Promise<VersionedSourceCheckpoint> {
    if (checkpoint.organizationId !== key.organizationId || checkpoint.sourceType !== key.sourceType || checkpoint.sourceId !== key.sourceId || checkpoint.sourceId !== connectionId) throw new Error("CHECKPOINT_SOURCE_BOUNDARY_MISMATCH");
    const storageKey = this.#key(key, connectionId); const current = this.#records.get(storageKey); if ((current?.version ?? null) !== expectedVersion) throw new Error("CHECKPOINT_OPTIMISTIC_LOCK_CONFLICT");
    const next = { version: (current?.version ?? 0) + 1, connectionId, checkpoint } satisfies VersionedSourceCheckpoint; this.#records.set(storageKey, next); return next;
  }
}
