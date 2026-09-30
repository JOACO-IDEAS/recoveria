import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { assertCsrf, founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function POST(request: Request) {
  try {
    const session = founderSession(request); assertCsrf(request, session);
    const runtime = founderRuntime(); const source = await runtime.initialize();
    const summary = await runtime.service.sync(session, { connectedSourceId: source.id, csrfToken: session.csrfToken });
    return corsJson({ summary, ...(await runtime.status()) });
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 409); }
}
