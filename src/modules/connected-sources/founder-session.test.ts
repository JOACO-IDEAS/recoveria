import { describe, expect, it } from "vitest";
import { FounderSessionService, InMemoryStagingSessionRepository } from "../staging/auth";
describe("founder connected-source session lifecycle", () => {
  it("never bootstraps an anonymous authenticated session", async () => { const auth = new FounderSessionService(new InMemoryStagingSessionRepository(), "s".repeat(43), ["founder@example.test"]); await expect(auth.authenticate(undefined)).rejects.toThrow("FOUNDER_SESSION_REQUIRED"); });
  it("uses a durable, revocable binding after verified issuance", async () => { const auth = new FounderSessionService(new InMemoryStagingSessionRepository(), "s".repeat(43), ["founder@example.test"]); const issued = await auth.issue({ actorId: "founder", organizationId: "org", email: "founder@example.test" }); await expect(auth.authenticate(issued.cookie)).resolves.toMatchObject({ actorId: "founder", organizationId: "org" }); await auth.logout(issued.cookie); await expect(auth.authenticate(issued.cookie)).rejects.toThrow("FOUNDER_SESSION_INVALID"); });
});
