import { corsJson, corsOptions } from "@/modules/connected-sources/http";
import { assertCsrf, founderRuntime, founderSession, sanitizedRuntimeError } from "@/modules/connected-sources/founder-runtime";

export async function OPTIONS() { return corsOptions(); }
export async function POST(request: Request) {
  try {
    const session = await founderSession(request); await assertCsrf(request, session);
    const body = await request.json() as { folderId?: unknown };
    if (typeof body.folderId !== "string" || !/^[A-Za-z0-9_-]{10,}$/.test(body.folderId)) return corsJson({ error: "INVALID_REQUEST" }, 400);
    const runtime = founderRuntime(); const source = await runtime.initialize();
    return corsJson(await runtime.service.validateFolder(session, { connectedSourceId: source.id, csrfToken: session.csrfToken, untrustedFolderId: body.folderId }));
  } catch (error) { return corsJson({ error: sanitizedRuntimeError(error) }, 403); }
}
