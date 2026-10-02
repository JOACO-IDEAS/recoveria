import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { assertCsrf, founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";
import { AsyncProbeCoordinator } from "@/modules/staging/async-probe";
import { PrismaStagingAsyncProbeRepository } from "@/modules/staging/prisma-async-probe";
import { CloudTasksProbeDispatcher, MetadataAccessTokenProvider, cloudTasksConfiguration } from "@/modules/staging/cloud-tasks";

// STAGING_SYNTHETIC-only, no-provider async wiring proof. This route never
// touches ConnectedSource, never calls composeRealGoogleDrivePilot, and
// never reads/writes Drive. It exists only to exercise Product API -> Cloud
// Tasks -> worker -> durable terminal result with zero provider execution.
const PROBE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function OPTIONS() { return corsOptions(); }

export async function POST(request: Request) {
  if (process.env.RECOVERIA_ENVIRONMENT !== "STAGING_SYNTHETIC") return corsJson({ error: "STAGING_ASYNC_PROBE_NOT_AVAILABLE" }, 404);
  try {
    const session = await founderSession(request);
    await assertCsrf(request, session);
    const probeId = request.headers.get("X-Staging-Probe-Id") ?? "";
    if (!PROBE_ID_PATTERN.test(probeId)) throw new Error("STAGING_ASYNC_PROBE_ID_INVALID");
    const prisma = founderRuntime().prisma;
    const coordinator = new AsyncProbeCoordinator(new PrismaStagingAsyncProbeRepository(prisma), new CloudTasksProbeDispatcher(cloudTasksConfiguration(process.env), new MetadataAccessTokenProvider()));
    const task = await coordinator.accept(session.organizationId, probeId);
    return corsJson({ status: task.status, attempts: task.attempts, failureCode: task.failureCode }, task.status === "SUCCEEDED" || task.status === "FAILED" ? 200 : 202);
  } catch (error) {
    return corsJson({ error: sanitizedRuntimeError(error) }, 409);
  }
}
