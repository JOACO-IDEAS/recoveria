import { describe, expect, it, vi } from "vitest";
import { handleProbeRequest, handleWorkerRequest } from "./worker-http";

// Real Cloud Tasks deterministic names are "<sync|probe>-" + 40 lowercase
// hex characters (see src/modules/staging/cloud-tasks.ts). X-CloudTasks-TaskName
// carries only this bare short name -- never a "projects/.../tasks/..."
// resource path (confirmed against official Cloud Tasks documentation).
const syncA = `sync-${"a".repeat(40)}`;
const syncB = `sync-${"b".repeat(40)}`;
const probeA = `probe-${"a".repeat(40)}`;
const probeB = `probe-${"b".repeat(40)}`;
const legacyFullPathHeader = `projects/p/locations/l/queues/q/tasks/${syncA}`;

describe("private staging worker HTTP boundary", () => {
  it("exposes only health and bound task delivery", async () => {
    const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const }));
    await expect(handleWorkerRequest({ deliver } as never, { method: "GET", path: "/health" })).resolves.toEqual({ status: 200, body: { status: "READY" } });
    await expect(handleWorkerRequest({ deliver } as never, { method: "GET", path: "/product" })).resolves.toMatchObject({ status: 404 });
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", body: { taskName: syncA } })).resolves.toMatchObject({ status: 403 }); // missing task identity header
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: syncA, body: { taskName: syncB } })).resolves.toMatchObject({ status: 403 }); // body/header mismatch -- durable identity check preserved
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: syncA, body: { taskName: syncA } })).resolves.toEqual({ status: 200, body: { status: "SUCCEEDED" } });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("accepts only the real Cloud Tasks bare task-name header shape, never the full resource-path shape", async () => {
    const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const }));
    // The actual Cloud Tasks wire format: bare short name.
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: syncA, body: { taskName: syncA } })).resolves.toMatchObject({ status: 200 });
    // Google never sends a full resource path on this header; such a value must now be rejected, not parsed.
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: legacyFullPathHeader, body: { taskName: syncA } })).resolves.toMatchObject({ status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } });
  });

  it("rejects malformed task names outright, before any body comparison", async () => {
    const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const }));
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: "sync-a", body: { taskName: "sync-a" } })).resolves.toMatchObject({ status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } }); // too short, not real hex suffix
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: "'; DROP TABLE staging_sync_task;--", body: { taskName: "'; DROP TABLE staging_sync_task;--" } })).resolves.toMatchObject({ status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } });
    await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: "", body: { taskName: "" } })).resolves.toMatchObject({ status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } });
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe("private staging probe HTTP boundary (no-provider)", () => {
  it("exposes only bound probe-name delivery on its own path, rejecting everything else", async () => {
    const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const }));
    await expect(handleProbeRequest({ deliver } as never, { method: "GET", path: "/internal/tasks/probe" })).resolves.toMatchObject({ status: 404 });
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: probeA, body: { probeName: probeA } })).resolves.toMatchObject({ status: 404 }); // wrong path, even with a valid-looking body
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", body: { probeName: probeA } })).resolves.toMatchObject({ status: 403 }); // missing task identity header
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: probeA, body: { probeName: probeB } })).resolves.toMatchObject({ status: 403 }); // body/header mismatch -- durable identity check preserved
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: probeA, body: { taskName: probeA } })).resolves.toMatchObject({ status: 403 }); // wrong body field name (taskName instead of probeName)
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: syncA, body: { probeName: syncA } })).resolves.toMatchObject({ status: 403 }); // well-formed but not probe-namespaced
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: probeA, body: { probeName: probeA } })).resolves.toEqual({ status: 200, body: { status: "SUCCEEDED" } });
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("accepts only the real Cloud Tasks bare task-name header shape, never the full resource-path shape", async () => {
    const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const }));
    const legacyFullPathProbeHeader = `projects/p/locations/l/queues/q/tasks/${probeA}`;
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: legacyFullPathProbeHeader, body: { probeName: probeA } })).resolves.toMatchObject({ status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("rejects malformed probe task names outright, before any body comparison", async () => {
    const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const }));
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: "probe-a", body: { probeName: "probe-a" } })).resolves.toMatchObject({ status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } });
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: "not-a-task-name", body: { probeName: "not-a-task-name" } })).resolves.toMatchObject({ status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } });
    expect(deliver).not.toHaveBeenCalled();
  });
});
