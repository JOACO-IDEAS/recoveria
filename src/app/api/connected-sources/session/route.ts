import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { founderCookie, founderRuntime, issueFounderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function GET() {
  try {
    const session = issueFounderSession();
    const state = await founderRuntime().status();
    return corsJson({ csrfToken: session.csrfToken, ...state }, 200, { "Set-Cookie": founderCookie(session) });
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 503); }
}
