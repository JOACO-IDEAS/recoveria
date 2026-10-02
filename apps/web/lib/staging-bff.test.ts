import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUpstreamHeaders, isStagingBffPathAllowed, stagingBff } from "./staging-bff";

test("allows the exact reviewed async-probe path", () => {
  assert.equal(isStagingBffPathAllowed("api/staging/async-probe"), true);
});

test("rejects unrelated api/staging/* paths -- proves this is an exact match, not a new prefix/wildcard", () => {
  assert.equal(isStagingBffPathAllowed("api/staging/other-route"), false);
  assert.equal(isStagingBffPathAllowed("api/staging/async-probe/extra"), false);
  assert.equal(isStagingBffPathAllowed("api/staging/async-probe-evil"), false);
  assert.equal(isStagingBffPathAllowed("api/staging/"), false);
});

test("preserves the three existing prefix-allowed route families unchanged", () => {
  assert.equal(isStagingBffPathAllowed("api/connected-sources/sync"), true);
  assert.equal(isStagingBffPathAllowed("api/product-surface/invoices"), true);
  assert.equal(isStagingBffPathAllowed("api/staging-auth/login"), true);
});

test("rejects an entirely unrelated path", () => {
  assert.equal(isStagingBffPathAllowed("api/other/thing"), false);
  assert.equal(isStagingBffPathAllowed(""), false);
});

test("anonymous requests (no WIF OIDC assertion) are rejected even for the newly-allowed exact path -- the allowlist addition does not bypass authentication", async () => {
  process.env.RECOVERIA_STAGING_API_URL = "https://example.test";
  const request = new Request("https://staging-recoveria.vercel.app/api/staging/api/staging/async-probe", { method: "POST" });
  const response = await stagingBff(request, ["api", "staging", "async-probe"]);
  assert.equal(response.status, 503);
  const body = await response.json() as { error?: string };
  assert.equal(body.error, "STAGING_BFF_NOT_CONFIGURED");
});

test("missing RECOVERIA_STAGING_API_URL also rejects the exact path (base configuration still required)", async () => {
  const previous = process.env.RECOVERIA_STAGING_API_URL;
  delete process.env.RECOVERIA_STAGING_API_URL;
  try {
    const request = new Request("https://staging-recoveria.vercel.app/api/staging/api/staging/async-probe", { method: "POST", headers: { "x-vercel-oidc-token": "sentinel" } });
    const response = await stagingBff(request, ["api", "staging", "async-probe"]);
    assert.equal(response.status, 503);
  } finally {
    if (previous !== undefined) process.env.RECOVERIA_STAGING_API_URL = previous;
  }
});

// -- Header-forwarding correction (confirmed gap: STAGING_ASYNC_PROBE_ID_INVALID
// on the first real founder probe attempt) --

test("X-Staging-Probe-Id is forwarded to the backend unchanged", () => {
  const request = new Request("https://staging-recoveria.vercel.app/x", { headers: { "X-Staging-Probe-Id": "11111111-1111-4111-8111-111111111111" } });
  const headers = buildUpstreamHeaders({ request, idToken: "token", audience: "https://audience.test" });
  assert.equal(headers.get("x-staging-probe-id"), "11111111-1111-4111-8111-111111111111");
});

test("X-Sync-Intent-Id is forwarded to the backend unchanged -- confirmed by code inspection that the real Sync Now route (src/app/api/connected-sources/sync/route.ts) requires it and previously never received it through this proxy", () => {
  const request = new Request("https://staging-recoveria.vercel.app/x", { headers: { "X-Sync-Intent-Id": "22222222-2222-4222-8222-222222222222" } });
  const headers = buildUpstreamHeaders({ request, idToken: "token", audience: "https://audience.test" });
  assert.equal(headers.get("x-sync-intent-id"), "22222222-2222-4222-8222-222222222222");
});

test("unrelated custom headers are NOT forwarded -- no broad X-* passthrough exists", () => {
  const request = new Request("https://staging-recoveria.vercel.app/x", { headers: { "X-Evil-Header": "attacker-value", "X-Another-Custom-Thing": "also-attacker", "X-Staging-Probe-Id": "11111111-1111-4111-8111-111111111111" } });
  const headers = buildUpstreamHeaders({ request, idToken: "token", audience: "https://audience.test" });
  assert.equal(headers.has("x-evil-header"), false);
  assert.equal(headers.has("x-another-custom-thing"), false);
  assert.equal(headers.get("x-staging-probe-id"), "11111111-1111-4111-8111-111111111111"); // the one explicitly listed header still passes
});

test("the full forwarded header set is exactly the known allowlist, regardless of how many extra headers the inbound request carries", () => {
  const request = new Request("https://staging-recoveria.vercel.app/x", { headers: { "X-Staging-Probe-Id": "p", "X-Sync-Intent-Id": "s", "X-Csrf-Token": "c", "Content-Type": "application/json", Accept: "application/json", "X-Random-Header-1": "a", "X-Random-Header-2": "b", Cookie: "should-not-forward=1" } });
  const headers = buildUpstreamHeaders({ request, idToken: "token", audience: "https://audience.test", session: "session-value", csrf: "c" });
  const keys = [...headers.keys()].sort();
  assert.deepEqual(keys, ["accept", "authorization", "content-type", "x-csrf-token", "x-recoveria-browser-session", "x-recoveria-service-audience", "x-staging-probe-id", "x-sync-intent-id"]);
});

test("CSRF and session forwarding behavior is unchanged by this correction", () => {
  const request = new Request("https://staging-recoveria.vercel.app/x", { headers: { "X-Csrf-Token": "my-csrf" } });
  const headers = buildUpstreamHeaders({ request, idToken: "token", audience: "https://audience.test", session: "my-session", csrf: "my-csrf" });
  assert.equal(headers.get("x-csrf-token"), "my-csrf");
  assert.equal(headers.get("x-recoveria-browser-session"), "my-session");
});
