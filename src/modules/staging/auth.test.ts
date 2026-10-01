import { describe, expect, it } from "vitest";
import { FounderSessionService, InMemoryStagingSessionRepository } from "./auth";

describe("founder-only staging authentication", () => {
  it("issues an encrypted, revocable, tenant-bound session and enforces CSRF", async () => {
    const repository = new InMemoryStagingSessionRepository(); const auth = new FounderSessionService(repository, "s".repeat(43), ["founder@example.test"], () => 1_000);
    const issued = await auth.issue({ actorId: "founder", email: "Founder@Example.Test", organizationId: "recoveria-synthetic-pilot" });
    expect(issued.cookie).not.toMatch(/founder|example|recoveria/i); expect(auth.cookieHeader(issued.cookie)).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    const session = await auth.authenticate(issued.cookie); expect(session).toMatchObject({ actorId: "founder", email: "founder@example.test", organizationId: "recoveria-synthetic-pilot" });
    expect(() => auth.assertCsrf(session, "wrong")).toThrow("FOUNDER_CSRF_REJECTED"); expect(() => auth.assertCsrf(session, issued.csrfToken)).not.toThrow();
    await auth.logout(issued.cookie); await expect(auth.authenticate(issued.cookie)).rejects.toThrow("FOUNDER_SESSION_INVALID");
  });
  it("rejects non-allowlisted identities and tampered cookies", async () => { const auth = new FounderSessionService(new InMemoryStagingSessionRepository(), "s".repeat(43), ["founder@example.test"]); await expect(auth.issue({ actorId: "other", email: "other@example.test", organizationId: "recoveria-synthetic-pilot" })).rejects.toThrow("FOUNDER_IDENTITY_NOT_ALLOWED"); await expect(auth.authenticate("tampered.value.cookie")).rejects.toThrow("FOUNDER_SESSION_INVALID"); });
});
