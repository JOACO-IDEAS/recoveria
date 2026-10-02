import type { StagingSyncWorker } from "./sync-task";
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
