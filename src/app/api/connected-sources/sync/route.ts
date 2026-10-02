import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { assertCsrf, founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";
import { createHash, randomUUID } from "node:crypto";
import { PrismaSyncIntentRepository } from "@/modules/connected-sources/prisma-repository";
import { PrismaStagingSyncTaskRepository } from "@/modules/staging/prisma-task";
import { AsyncSyncCoordinator } from "@/modules/staging/sync-task";
import { CloudTasksSyncTaskDispatcher, MetadataAccessTokenProvider, cloudTasksConfiguration } from "@/modules/staging/cloud-tasks";

export async function OPTIONS() { return corsOptions(); }
export async function POST(request: Request) {
  try {
    const session = await founderSession(request); await assertCsrf(request, session);
    const runtime = founderRuntime(); const source = await runtime.initialize();
    const syncIntentId = request.headers.get("X-Sync-Intent-Id") ?? "";
    if (process.env.RECOVERIA_ENVIRONMENT !== "STAGING_SYNTHETIC") { const outcome = await runtime.service.sync(session, { connectedSourceId: source.id, csrfToken: session.csrfToken, syncIntentId }); return corsJson({ outcome, summary: outcome.summary, ...(await runtime.status()) }, outcome.status === "RUNNING" ? 202 : 200); }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncIntentId)) throw new Error("CONNECTED_SOURCE_SYNC_INTENT_INVALID");
    const coordinator = new AsyncSyncCoordinator(new PrismaSyncIntentRepository(runtime.prisma), new PrismaStagingSyncTaskRepository(runtime.prisma), new CloudTasksSyncTaskDispatcher(cloudTasksConfiguration(process.env), new MetadataAccessTokenProvider()));
    const task = await coordinator.accept({ organizationId: session.organizationId, connectedSourceId: source.id, syncIntentId, actorId: session.actorId, sessionBindingHash: createHash("sha256").update(session.sessionId).digest("hex"), executionId: randomUUID(), status: "RUNNING" });
    const intent = await runtime.prisma.connectedSourceSyncIntent.findUniqueOrThrow({ where: { organizationId_syncIntentId: { organizationId: session.organizationId, syncIntentId } } });
    const status = intent.status; return corsJson({ outcome: { status, executionId: intent.executionId, replay: intent.executionId !== task.executionId, summary: intent.summary, failureCode: intent.failureCode }, summary: intent.summary, ...(await runtime.status()) }, status === "RUNNING" ? 202 : 200);
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 409); }
}
