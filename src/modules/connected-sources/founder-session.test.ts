import { describe, expect, it } from "vitest";
import { founderCookie, issueFounderSession, resolveFounderSession } from "./founder-runtime";

describe("founder connected-source session lifecycle", () => {
  it("reuses the same live browser session instead of rotating its intent binding", () => {
    const first = issueFounderSession();
    const request = new Request("http://127.0.0.1:3100/api/connected-sources/session", {
      headers: { cookie: founderCookie(first).split(";")[0]! },
    });

    const resolved = resolveFounderSession(request);

    expect(resolved.created).toBe(false);
    expect(resolved.session.sessionId).toBe(first.sessionId);
    expect(resolved.session.browserBindingId).toBe(first.browserBindingId);
    expect(resolved.session.csrfToken).toBe(first.csrfToken);
  });

  it("creates a new browser binding only when no valid server session exists", () => {
    const resolved = resolveFounderSession(new Request("http://127.0.0.1:3100/api/connected-sources/session"));

    expect(resolved.created).toBe(true);
    expect(resolved.session.browserBindingId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(resolved.session.sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(resolved.session.browserBindingId).not.toBe(resolved.session.sessionId);
  });
});
