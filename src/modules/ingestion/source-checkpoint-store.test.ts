import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SourceCheckpoint } from "./incremental-corpus-processor";
import { LocalFileSourceCheckpointStore, serializeSourceCheckpoint, type SourceCheckpointKey } from "./source-checkpoint-store";

const key: SourceCheckpointKey = { organizationId: "org-a", sourceType: "GOOGLE_DRIVE", sourceId: "drive-a" };
const checkpoint: SourceCheckpoint = { schemaVersion: 1, ...key, revision: "revision-a", cursor: { ...key, value: "cursor-a" }, entries: [] };

describe("durable source checkpoint store", () => {
  it("serializes deterministically and atomically replaces a source-bound checkpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recoveria-checkpoints-")); const store = new LocalFileSourceCheckpointStore(directory);
    expect(serializeSourceCheckpoint(checkpoint)).toBe(serializeSourceCheckpoint({ entries: [], cursor: { value: "cursor-a", sourceId: "drive-a", sourceType: "GOOGLE_DRIVE", organizationId: "org-a" }, revision: "revision-a", sourceId: "drive-a", sourceType: "GOOGLE_DRIVE", organizationId: "org-a", schemaVersion: 1 }));
    await store.save(key, checkpoint); expect(await store.load(key)).toEqual({ status: "FOUND", checkpoint });
    const replacement = { ...checkpoint, revision: "revision-b" }; await store.save(key, replacement);
    expect(await store.load(key)).toEqual({ status: "FOUND", checkpoint: replacement });
  });

  it("isolates tenant/source keys and safely invalidates corrupt or incompatible state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "recoveria-checkpoints-")); const store = new LocalFileSourceCheckpointStore(directory);
    await expect(store.save({ ...key, organizationId: "org-b" }, checkpoint)).rejects.toThrow("CHECKPOINT_SOURCE_BOUNDARY_MISMATCH");
    await store.save(key, checkpoint);
    expect(await store.load({ ...key, sourceId: "drive-b" })).toEqual({ status: "MISSING" });
    const files = (await import("node:fs/promises")).readdir(directory); const path = join(directory, (await files)[0]!);
    await writeFile(path, "not-json", "utf8"); expect(await store.load(key)).toEqual({ status: "INVALIDATED" });
    expect(await readFile(path, "utf8")).toBe("not-json");
  });
});
