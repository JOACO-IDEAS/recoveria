import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { founderCookie, founderRuntime, resolveFounderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function GET(request: Request) {
  try {
    const { session } = resolveFounderSession(request);
    const state = await founderRuntime().status();
    return corsJson({ csrfToken: session.csrfToken, sessionBindingId: session.browserBindingId, ...state }, 200, { "Set-Cookie": founderCookie(session) });
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 503); }
}
