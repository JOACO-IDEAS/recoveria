import { test } from "node:test";
import assert from "node:assert/strict";
import { isStagingBffPathAllowed, stagingBff } from "./staging-bff";

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
