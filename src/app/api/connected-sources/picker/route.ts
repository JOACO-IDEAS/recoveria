import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function GET(request: Request) {
  try { await founderSession(request); return corsJson(await founderRuntime().pickerBootstrap()); }
  catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 401); }
}
