import { describe, expect, it, vi } from "vitest";
import { handleProbeRequest, handleWorkerRequest } from "./worker-http";
describe("private staging worker HTTP boundary", () => {
  it("exposes only health and bound task delivery", async () => { const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const })); await expect(handleWorkerRequest({ deliver } as never, { method: "GET", path: "/health" })).resolves.toEqual({ status: 200, body: { status: "READY" } }); await expect(handleWorkerRequest({ deliver } as never, { method: "GET", path: "/product" })).resolves.toMatchObject({ status: 404 }); await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", body: { taskName: "sync-a" } })).resolves.toMatchObject({ status: 403 }); await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: "projects/p/locations/l/queues/q/tasks/sync-a", body: { taskName: "sync-b" } })).resolves.toMatchObject({ status: 403 }); await expect(handleWorkerRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: "projects/p/locations/l/queues/q/tasks/sync-a", body: { taskName: "sync-a" } })).resolves.toEqual({ status: 200, body: { status: "SUCCEEDED" } }); expect(deliver).toHaveBeenCalledOnce(); });
});

describe("private staging probe HTTP boundary (no-provider)", () => {
  it("exposes only bound probe-name delivery on its own path, rejecting everything else", async () => {
    const deliver = vi.fn(async () => ({ status: "SUCCEEDED" as const }));
    await expect(handleProbeRequest({ deliver } as never, { method: "GET", path: "/internal/tasks/probe" })).resolves.toMatchObject({ status: 404 });
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/sync", taskHeader: "projects/p/locations/l/queues/q/tasks/probe-a", body: { probeName: "probe-a" } })).resolves.toMatchObject({ status: 404 }); // wrong path, even with a valid-looking body
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", body: { probeName: "probe-a" } })).resolves.toMatchObject({ status: 403 }); // missing task identity header
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: "projects/p/locations/l/queues/q/tasks/probe-a", body: { probeName: "probe-b" } })).resolves.toMatchObject({ status: 403 }); // body/header mismatch
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: "projects/p/locations/l/queues/q/tasks/probe-a", body: { taskName: "probe-a" } })).resolves.toMatchObject({ status: 403 }); // wrong body field name (taskName instead of probeName)
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: "projects/p/locations/l/queues/q/tasks/sync-a", body: { probeName: "sync-a" } })).resolves.toMatchObject({ status: 403 }); // well-formed but not probe-namespaced
    await expect(handleProbeRequest({ deliver } as never, { method: "POST", path: "/internal/tasks/probe", taskHeader: "projects/p/locations/l/queues/q/tasks/probe-a", body: { probeName: "probe-a" } })).resolves.toEqual({ status: 200, body: { status: "SUCCEEDED" } });
    expect(deliver).toHaveBeenCalledOnce();
  });
});
