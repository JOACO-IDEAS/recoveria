import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { assertCsrf, founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function POST(request: Request) {
  try {
    const session = await founderSession(request); await assertCsrf(request, session);
    const runtime = founderRuntime(); const source = await runtime.initialize();
    const syncIntentId = request.headers.get("X-Sync-Intent-Id") ?? "";
    const outcome = await runtime.service.sync(session, { connectedSourceId: source.id, csrfToken: session.csrfToken, syncIntentId });
    return corsJson({ outcome, summary: outcome.summary, ...(await runtime.status()) }, outcome.status === "RUNNING" ? 202 : 200);
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 409); }
}
