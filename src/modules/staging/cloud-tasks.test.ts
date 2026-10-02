import { describe, expect, it, vi } from "vitest";
import { CloudTasksProbeDispatcher, CloudTasksSyncTaskDispatcher, cloudTasksConfiguration } from "./cloud-tasks";
const task = { organizationId: "org", connectedSourceId: "source", syncIntentId: "intent", executionId: "execution", name: "sync-safe", status: "PENDING" as const, attempts: 0 };
const probeTask = { organizationId: "org", probeId: "probe-intent", name: "probe-safe", status: "PENDING" as const, attempts: 0 };
describe("Cloud Tasks dispatcher", () => {
  it("dispatches deterministic OIDC-authenticated delivery without exposing credentials", async () => { const fetcher = vi.fn(async (requestedUrl: string, requestedInit: RequestInit) => { void requestedUrl; void requestedInit; return new Response("{}", { status: 200 }); }); const dispatcher = new CloudTasksSyncTaskDispatcher({ projectId: "recoveria-pilot", location: "southamerica-east1", queue: "staging", workerUrl: "https://worker.run.app", workerAudience: "https://worker.run.app", taskServiceAccount: "tasks@example.test" }, { get: async () => "memory-only-access-token" }, fetcher as unknown as typeof fetch); await dispatcher.dispatch(task); const [url, init] = fetcher.mock.calls[0]!; expect(url).toContain("/tasks"); expect(JSON.parse(String(init.body))).toMatchObject({ task: { name: expect.stringContaining("sync-safe"), httpRequest: { oidcToken: { audience: "https://worker.run.app", serviceAccountEmail: "tasks@example.test" } } } }); expect(JSON.stringify(init.body)).not.toContain("memory-only-access-token"); });
  it("treats deterministic provider conflict as idempotent and rejects invalid audience", async () => { await expect(new CloudTasksSyncTaskDispatcher({ projectId: "p", location: "l", queue: "q", workerUrl: "https://worker.run.app", workerAudience: "https://worker.run.app", taskServiceAccount: "tasks@example.test" }, { get: async () => "token" }, async () => new Response("", { status: 409 })).dispatch(task)).resolves.toBeUndefined(); expect(() => cloudTasksConfiguration({ RECOVERIA_WORKER_URL: "https://worker.run.app", RECOVERIA_WORKER_AUDIENCE: "https://other.run.app", RECOVERIA_GOOGLE_PROJECT_ID: "p", RECOVERIA_TASK_LOCATION: "l", RECOVERIA_TASK_QUEUE: "q", RECOVERIA_TASK_SERVICE_ACCOUNT: "sa" })).toThrow("STAGING_WORKER_AUDIENCE_INVALID"); });
});

describe("Cloud Tasks probe dispatcher (no-provider)", () => {
  it("dispatches to the distinct /internal/tasks/probe path with a probeName body, never the sync path/body shape", async () => {
    const fetcher = vi.fn(async (requestedUrl: string, requestedInit: RequestInit) => { void requestedUrl; void requestedInit; return new Response("{}", { status: 200 }); });
    const dispatcher = new CloudTasksProbeDispatcher({ projectId: "recoveria-pilot", location: "southamerica-east1", queue: "staging", workerUrl: "https://worker.run.app", workerAudience: "https://worker.run.app", taskServiceAccount: "tasks@example.test" }, { get: async () => "memory-only-access-token" }, fetcher as unknown as typeof fetch);
    await dispatcher.dispatch(probeTask);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/tasks");
    const payload = JSON.parse(String(init.body));
    expect(payload.task.httpRequest.url).toBe("https://worker.run.app/internal/tasks/probe");
    const decodedBody = JSON.parse(Buffer.from(payload.task.httpRequest.body, "base64").toString("utf8"));
    expect(decodedBody).toEqual({ probeName: "probe-safe" }); // never taskName, never connectedSourceId/syncIntentId/executionId
    expect(JSON.stringify(init.body)).not.toContain("memory-only-access-token");
  });
  it("treats deterministic provider conflict (duplicate dispatch) as idempotent", async () => {
    await expect(new CloudTasksProbeDispatcher({ projectId: "p", location: "l", queue: "q", workerUrl: "https://worker.run.app", workerAudience: "https://worker.run.app", taskServiceAccount: "tasks@example.test" }, { get: async () => "token" }, async () => new Response("", { status: 409 })).dispatch(probeTask)).resolves.toBeUndefined();
  });
});
