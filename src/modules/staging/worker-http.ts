import type { StagingSyncWorker } from "./sync-task";
import type { StagingAsyncProbeWorker } from "./async-probe";
export interface WorkerHttpRequest { method: string; path: string; taskHeader?: string; body?: unknown }
export interface WorkerHttpResponse { status: number; body: { status?: string; error?: string } }

// X-CloudTasks-TaskName carries only the bare short task ID, never a
// resource path -- confirmed against current official Cloud Tasks
// documentation: "The 'short' name of the task... This is the my-task-id
// value in the complete task name, i.e. task_name =
// projects/.../queues/.../tasks/my-task-id." There is no "/tasks/"
// substring to search for; the header value IS the task name. Both
// dispatchers in src/modules/staging/cloud-tasks.ts always generate names
// matching /^(sync|probe)-[0-9a-f]{40}$/, so that is the only legitimate
// form this parser needs to accept -- anything else is rejected outright,
// before ever comparing it against the request body.
const TASK_NAME_PATTERN = /^(?:sync|probe)-[0-9a-f]{40}$/;
function extractTaskName(request: WorkerHttpRequest): string | undefined {
  const header = request.taskHeader;
  return header && TASK_NAME_PATTERN.test(header) ? header : undefined;
}

export async function handleWorkerRequest(worker: Pick<StagingSyncWorker, "deliver">, request: WorkerHttpRequest): Promise<WorkerHttpResponse> {
  if (request.method === "GET" && request.path === "/health") return { status: 200, body: { status: "READY" } };
  if (request.method !== "POST" || request.path !== "/internal/tasks/sync") return { status: 404, body: { error: "NOT_FOUND" } };
  const taskName = extractTaskName(request);
  if (!taskName) return { status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } };
  const body = request.body as { taskName?: unknown } | undefined;
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
  const taskName = extractTaskName(request);
  if (!taskName) return { status: 403, body: { error: "TASK_IDENTITY_REQUIRED" } };
  const body = request.body as { probeName?: unknown } | undefined;
  if (!body || typeof body.probeName !== "string" || body.probeName !== taskName) return { status: 403, body: { error: "TASK_BINDING_INVALID" } };
  if (!taskName.startsWith("probe-")) return { status: 403, body: { error: "TASK_BINDING_INVALID" } };
  try { const result = await prober.deliver(taskName); return { status: 200, body: { status: result.status } }; } catch (error) { const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "STAGING_PROBE_WORKER_FAILED"; return { status: 400, body: { error: code } }; }
}
