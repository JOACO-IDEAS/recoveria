import { createServer } from "node:http";
import { founderRuntime } from "../../src/modules/connected-sources/founder-runtime";
import { PrismaSyncIntentRepository } from "../../src/modules/connected-sources/prisma-repository";
import { PrismaStagingSyncTaskRepository } from "../../src/modules/staging/prisma-task";
import { StagingSyncWorker } from "../../src/modules/staging/sync-task";
import { PrismaStagingAsyncProbeRepository } from "../../src/modules/staging/prisma-async-probe";
import { StagingAsyncProbeWorker } from "../../src/modules/staging/async-probe";
import { validateStagingRuntimeConfiguration } from "../../src/modules/staging/runtime-config";
import { handleProbeRequest, handleWorkerRequest } from "../../src/modules/staging/worker-http";

let startupStage = "CONFIGURATION";

async function main(): Promise<void> {
  validateStagingRuntimeConfiguration(process.env, "WORKER");
  const port = Number(process.env.PORT); if (!Number.isSafeInteger(port) || port <= 0) throw new Error("STAGING_PORT_REQUIRED");
  startupStage = "RUNTIME_COMPOSITION";
  const runtime = founderRuntime();
  startupStage = "DATABASE_PROBE";
  const database = await runtime.prisma.$queryRawUnsafe<Array<{ database: string }>>("SELECT current_database()::text AS database"); if (database[0]?.database !== "recoveria_pilot") throw new Error("STAGING_DATABASE_BOUNDARY_REJECTED"); const tasks = new PrismaStagingSyncTaskRepository(runtime.prisma); const intents = new PrismaSyncIntentRepository(runtime.prisma);
  startupStage = "HTTP_BIND";
  const worker = new StagingSyncWorker(intents, tasks, async task => { const intent = await runtime.prisma.connectedSourceSyncIntent.findUnique({ where: { organizationId_syncIntentId: { organizationId: task.organizationId, syncIntentId: task.syncIntentId } } }); if (!intent || intent.connectedSourceId !== task.connectedSourceId || intent.executionId !== task.executionId) throw new Error("STAGING_TASK_BINDING_INVALID"); return runtime.service.executeQueued({ organizationId: task.organizationId, connectedSourceId: task.connectedSourceId, actorId: intent.actorId, executionId: task.executionId }); });
  const prober = new StagingAsyncProbeWorker(new PrismaStagingAsyncProbeRepository(runtime.prisma));
  const json = (response: import("node:http").ServerResponse, status: number, body: object) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" }); response.end(JSON.stringify(body)); };
  const server = createServer(async (request, response) => { let raw = ""; try { for await (const chunk of request) { raw += chunk; if (raw.length > 4096) throw new Error("TASK_PAYLOAD_INVALID"); } const path = new URL(request.url ?? "/", "http://worker.invalid").pathname; const workerRequest = { method: request.method ?? "", path, taskHeader: typeof request.headers["x-cloudtasks-taskname"] === "string" ? request.headers["x-cloudtasks-taskname"] : undefined, body: raw ? JSON.parse(raw) : undefined }; const result = path === "/internal/tasks/probe" ? await handleProbeRequest(prober, workerRequest) : await handleWorkerRequest(worker, workerRequest); console.log(JSON.stringify({ event: "STAGING_WORKER_REQUEST", path, status: result.status })); return json(response, result.status, result.body); } catch { console.error(JSON.stringify({ event: "STAGING_TASK_REJECTED", code: "TASK_PAYLOAD_INVALID" })); return json(response, 400, { error: "TASK_PAYLOAD_INVALID" }); } });
  server.listen(port, "0.0.0.0", () => console.log(JSON.stringify({ event: "STAGING_WORKER_READY", port })));
  const shutdown = () => server.close(() => void runtime.prisma.$disconnect().finally(() => process.exit(0))); process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}

void main().catch((error: unknown) => {
  const candidate = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  const safe = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_]+$/.test(value) ? value : undefined;
  console.error(JSON.stringify({ event: "STAGING_WORKER_START_FAILED", stage: startupStage, errorName: safe(candidate.name), errorCode: safe(candidate.code) }));
  process.exit(1);
});
