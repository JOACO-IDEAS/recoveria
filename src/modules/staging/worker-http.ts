import type { StagingSyncWorker } from "./sync-task";
import type { StagingAsyncProbeWorker } from "./async-probe";
export interface WorkerHttpRequest { method: string; path: string; taskHeader?: string; body?: unknown }
export interface WorkerHttpResponse { status: number; body: { status?: string; error?: string } }
export async function handleWorkerRequest(worker: Pick<StagingSyncWorker, "deliver">, request: WorkerHttpRequest): Promise<WorkerHttpResponse> {
  if (request.method === "GET" && request.path === "/health") return { status: 200, body: { status: "READY" } };
  if (request.method !== "POST" || request.path !== "/internal/tasks/sync") return { status: 404, body: { error: "NOT_FOUND" } };
  if (!request.taskHeader?.includes("/tasks/")) return { status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } };
  const taskName = request.taskHeader.slice(request.taskHeader.lastIndexOf("/tasks/") + 7); const body = request.body as { taskName?: unknown } | undefined;
  if (!body || typeof body.taskName !== "string" || body.taskName !== taskName) return { status: 403, body: { error: "TASK_BINDING_INVALID" } };
  try { const result = await worker.deliver(taskName); return { status: 200, body: { status: result.status } }; } catch (error) { const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "STAGING_WORKER_FAILED"; return { status: 400, body: { error: code } }; }
}

// Structurally separate from handleWorkerRequest above: a distinct path
// (/internal/tasks/probe), a distinct body field (probeName, never
// taskName), and a prober type that never exposes any provider/Drive
// execution path. This cannot be reached via the real sync route or vice
// versa.
export async function handleProbeRequest(prober: Pick<StagingAsyncProbeWorker, "deliver">, request: WorkerHttpRequest): Promise<WorkerHttpResponse> {
  if (request.method !== "POST" || request.path !== "/internal/tasks/probe") return { status: 404, body: { error: "NOT_FOUND" } };
  if (!request.taskHeader?.includes("/tasks/")) return { status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } };
  const taskName = request.taskHeader.slice(request.taskHeader.lastIndexOf("/tasks/") + 7); const body = request.body as { probeName?: unknown } | undefined;
  if (!body || typeof body.probeName !== "string" || body.probeName !== taskName) return { status: 403, body: { error: "TASK_BINDING_INVALID" } };
  if (!taskName.startsWith("probe-")) return { status: 403, body: { error: "TASK_BINDING_INVALID" } };
  try { const result = await prober.deliver(taskName); return { status: 200, body: { status: result.status } }; } catch (error) { const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "STAGING_PROBE_WORKER_FAILED"; return { status: 400, body: { error: code } }; }
}
