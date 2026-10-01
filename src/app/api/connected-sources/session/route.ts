import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function GET(request: Request) {
  try {
    const session = await founderSession(request);
    const state = await founderRuntime().status();
    return corsJson({ csrfToken: session.csrfToken, sessionBindingId: session.sessionId, ...state });
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 401); }
}
