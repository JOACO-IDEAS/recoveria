const ORIGIN = "http://127.0.0.1:3101";

export function corsHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, X-Sync-Intent-Id, X-Staging-Probe-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...extra,
  });
}

export function corsJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: corsHeaders(extra) });
}

export function corsOptions(): Response { return new Response(null, { status: 204, headers: corsHeaders() }); }
