import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { assertCsrf, founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function POST(request: Request) {
  try {
    const session = await founderSession(request); await assertCsrf(request, session);
    const body = await request.json() as { candidateId?: unknown };
    if (typeof body.candidateId !== "string" || !body.candidateId) return corsJson({ error: "INVALID_REQUEST" }, 400);
    const runtime = founderRuntime(); const source = await runtime.initialize();
    const confirmed = await runtime.service.confirmFolder(session, { connectedSourceId: source.id, candidateId: body.candidateId, csrfToken: session.csrfToken });
    return corsJson({ source: runtime.service.productView(confirmed) });
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 403); }
}
