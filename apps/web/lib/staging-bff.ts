import { cookies } from "next/headers";
import { cloudRunIdToken, wifConfiguration } from "./wif";
const allowedPrefixes = ["api/connected-sources/", "api/product-surface/", "api/staging-auth/"];
// Exact-match only (never a prefix): the reviewed STAGING_SYNTHETIC no-provider
// async probe route. Do not widen this to "api/staging/" or any other
// prefix/wildcard -- it must remain the single, exact, reviewed path.
const allowedExact = new Set(["api/staging/async-probe"]);
export function isStagingBffPathAllowed(suffix: string): boolean { return allowedPrefixes.some(prefix => suffix.startsWith(prefix)) || allowedExact.has(suffix); }

// Explicit, named forwarding only -- never a generic X-* passthrough. Each
// backend route that needs its own identifier header must be listed here by
// exact lowercase name; anything not listed is never forwarded, regardless
// of what the inbound request carries.
const FORWARDED_IDENTIFIER_HEADERS = ["x-staging-probe-id", "x-sync-intent-id"] as const;
export function buildUpstreamHeaders(input: { readonly request: Request; readonly idToken: string; readonly audience: string; readonly session?: string; readonly csrf?: string | null }): Headers {
  const headers = new Headers({ authorization: `Bearer ${input.idToken}`, "x-recoveria-service-audience": input.audience, accept: input.request.headers.get("accept") ?? "application/json" });
  if (input.session) headers.set("x-recoveria-browser-session", input.session);
  if (input.csrf) headers.set("x-csrf-token", input.csrf);
  const contentType = input.request.headers.get("content-type"); if (contentType) headers.set("content-type", contentType);
  for (const name of FORWARDED_IDENTIFIER_HEADERS) { const value = input.request.headers.get(name); if (value) headers.set(name, value); }
  return headers;
}

export async function stagingBff(request: Request, path: string[]): Promise<Response> {
  const suffix = path.join("/"); const base = process.env.RECOVERIA_STAGING_API_URL; const assertion = request.headers.get("x-vercel-oidc-token");
  if (!isStagingBffPathAllowed(suffix) || !base || !assertion) return Response.json({ error: "STAGING_BFF_NOT_CONFIGURED" }, { status: 503 });
  const session = (await cookies()).get("__Host-recoveria_staging_session")?.value;
  const publicRoute = suffix === "api/staging-auth/login" || suffix === "api/connected-sources/oauth/callback";
  if (!session && !publicRoute) return Response.json({ error: "FOUNDER_SESSION_REQUIRED" }, { status: 401 });
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const csrf = request.headers.get("x-csrf-token");
  if (mutation && !csrf && !publicRoute) return Response.json({ error: "FOUNDER_CSRF_REJECTED" }, { status: 403 });
  try {
    const configuration = wifConfiguration(process.env);
    const idToken = await cloudRunIdToken(assertion, configuration);
    const source = new URL(request.url); const target = new URL(`/${suffix}`, base); target.search = source.search;
    const headers = buildUpstreamHeaders({ request, idToken, audience: configuration.cloudRunAudience, session, csrf });
    const upstream = await fetch(target, { method: request.method, headers, body: mutation ? await request.arrayBuffer() : undefined, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const responseHeaders = new Headers({ "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
    const setCookie = upstream.headers.get("set-cookie"); if (setCookie) responseHeaders.set("set-cookie", setCookie);
    if (upstream.headers.get("content-type") === "application/pdf") responseHeaders.set("content-security-policy", "default-src 'none'; frame-ancestors 'self'; sandbox");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch { return Response.json({ error: "STAGING_API_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } }); }
}
