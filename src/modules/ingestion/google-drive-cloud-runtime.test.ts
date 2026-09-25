import { describe, expect, it, vi } from "vitest";
import { createCloudRunCallbackHandler } from "./google-drive-cloud-adapters";
import { callbackQuery, createGoogleDriveCloudRuntime } from "./google-drive-cloud-runtime";

describe("Google Drive Cloud Run bootstrap boundary", () => {
  const callback = createCloudRunCallbackHandler("/oauth/google/callback", { async handle() { throw new Error("GOOGLE_DRIVE_ACTIVATION_NOT_READY"); } });
  const runtime = (databaseProbe: () => Promise<string> = async () => "recoveria_pilot") => createGoogleDriveCloudRuntime({ callbackPath: "/oauth/google/callback", expectedDatabase: "recoveria_pilot", databaseProbe, callbackHandler: callback });

  it("exposes only sanitized health and exact callback routes", async () => {
    await expect(runtime()({ method: "GET", path: "/health", query: {} })).resolves.toEqual({ status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify({ status: "READY", oauth: "NOT_READY", drive: "DISABLED" }) });
    await expect(runtime()({ method: "GET", path: "/admin", query: {} })).resolves.toMatchObject({ status: 404 });
    await expect(runtime()({ method: "POST", path: "/health", query: {} })).resolves.toMatchObject({ status: 404 });
  });

  it("fails health closed without leaking database errors or identity", async () => {
    const failing = runtime(async () => { throw new Error("postgresql://secret:password@private/recoveria_pilot"); });
    const response = await failing({ method: "GET", path: "/health", query: {} });
    expect(response).toMatchObject({ status: 503, body: JSON.stringify({ status: "NOT_READY" }) });
    expect(JSON.stringify(response)).not.toMatch(/postgres|password|private|recoveria_pilot/);
    await expect(runtime(async () => "other")({ method: "GET", path: "/health", query: {} })).resolves.toMatchObject({ status: 503 });
  });

  it("preserves duplicate rejection and pre-OAuth durable fail-closed behavior", async () => {
    const probe = vi.fn(async () => "recoveria_pilot"); const handler = runtime(probe);
    const invalid = await handler({ method: "GET", path: "/oauth/google/callback", query: { state: "state", code: "code" } });
    expect(invalid).toMatchObject({ status: 400, body: JSON.stringify({ status: "CALLBACK_REJECTED" }) });
    expect(invalid.body).not.toMatch(/state|nonce|code/);
    const duplicate = await handler({ method: "GET", path: "/oauth/google/callback", query: callbackQuery(new URLSearchParams("state=a&state=b&code=c")) });
    expect(duplicate).toMatchObject({ status: 400, body: JSON.stringify({ status: "INVALID_CALLBACK" }) });
    expect(probe).not.toHaveBeenCalled();
  });
});
