import { describe, expect, it } from "vitest";
import { ConnectedSourceService, InMemoryConnectedSourceRepository, InMemoryFolderCandidateRepository, createGooglePickerBootstrap, type ConnectedSourceSyncEngine, type ProductActor } from "./service";

const actor: ProductActor = { organizationId: "org", actorId: "user", sessionId: "session", csrfToken: "csrf" };
const summary = (documentsAnalyzed = 40) => ({ documentsAnalyzed, uniqueDocuments: documentsAnalyzed - 1, exactDuplicates: 1, possibleDuplicates: 0, detectedEntities: 5, reviewRequired: 7 });

describe("ConnectedSourceService offline product flow", () => {
  it("connects, validates an untrusted Picker selection, confirms it and never returns the root in product DTOs", async () => {
    const sources = new InMemoryConnectedSourceRepository(); let validations = 0;
    const service = new ConnectedSourceService(sources, new InMemoryFolderCandidateRepository(), { async validate(input) { validations += 1; expect(input.untrustedFolderId).toBe("picker-folder"); return { providerRootReference: "server-verified-root", safeDisplayName: "Facturas emitidas", mimeType: "application/vnd.google-apps.folder", trashed: false, location: "MY_DRIVE" }; } }, { async execute() { return summary(); } }, () => new Date("2026-09-30T12:00:00Z"));
    const source = await service.ensureConnection("org", "connection");
    const candidate = await service.validateFolder(actor, { connectedSourceId: source.id, csrfToken: "csrf", untrustedFolderId: "picker-folder" });
    expect(candidate).toEqual({ candidateId: expect.any(String), displayName: "Facturas emitidas" });
    const ready = await service.confirmFolder(actor, { connectedSourceId: source.id, candidateId: candidate.candidateId, csrfToken: "csrf" });
    expect(ready).toMatchObject({ health: "READY", providerRootReference: "server-verified-root", rootBoundaryVersion: 1 });
    expect(service.productView(ready)).not.toHaveProperty("providerRootReference");
    expect(validations).toBe(1);
  });

  it("coalesces concurrent Sync Now and records only committed documentary value", async () => {
    const sources = new InMemoryConnectedSourceRepository(); let calls = 0; let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const engine: ConnectedSourceSyncEngine = { async execute(input) { calls += 1; expect(input.providerRootReference).toBe("verified"); await wait; return summary(); } };
    const service = new ConnectedSourceService(sources, new InMemoryFolderCandidateRepository(), { async validate() { return { providerRootReference: "verified", safeDisplayName: "Facturas", mimeType: "application/vnd.google-apps.folder", trashed: false, location: "MY_DRIVE" }; } }, engine, () => new Date("2026-09-30T12:00:00Z"));
    const source = await service.ensureConnection("org", "connection"); const candidate = await service.validateFolder(actor, { connectedSourceId: source.id, csrfToken: "csrf", untrustedFolderId: "candidate" }); await service.confirmFolder(actor, { connectedSourceId: source.id, candidateId: candidate.candidateId, csrfToken: "csrf" });
    const first = service.sync(actor, { connectedSourceId: source.id, csrfToken: "csrf" }); const second = service.sync(actor, { connectedSourceId: source.id, csrfToken: "csrf" }); release();
    expect(await first).toEqual(await second); expect(calls).toBe(1);
    expect(await sources.find("org", source.id)).toMatchObject({ health: "REVIEW_REQUIRED", committedDocumentCount: 40, reviewRequiredCount: 7 });
  });

  it("changes root as a new boundary, preserves prior value until fresh sync, and disconnect requires reconfirmation", async () => {
    const sources = new InMemoryConnectedSourceRepository(); const roots = ["root-a", "root-b"];
    const service = new ConnectedSourceService(sources, new InMemoryFolderCandidateRepository(), { async validate() { const providerRootReference = roots.shift()!; return { providerRootReference, safeDisplayName: providerRootReference, mimeType: "application/vnd.google-apps.folder", trashed: false, location: "MY_DRIVE" }; } }, { async execute() { return summary(); } });
    const source = await service.ensureConnection("org", "connection");
    const first = await service.validateFolder(actor, { connectedSourceId: source.id, csrfToken: "csrf", untrustedFolderId: "a" }); await service.confirmFolder(actor, { connectedSourceId: source.id, candidateId: first.candidateId, csrfToken: "csrf" }); await service.sync(actor, { connectedSourceId: source.id, csrfToken: "csrf" });
    const prior = await sources.find("org", source.id); expect(prior?.committedDocumentCount).toBe(40);
    const second = await service.validateFolder(actor, { connectedSourceId: source.id, csrfToken: "csrf", untrustedFolderId: "b" }); const changed = await service.confirmFolder(actor, { connectedSourceId: source.id, candidateId: second.candidateId, csrfToken: "csrf" });
    expect(changed).toMatchObject({ rootBoundaryVersion: 2, committedDocumentCount: 0, health: "READY" });
    const disconnected = await service.disconnect(actor, { connectedSourceId: source.id, csrfToken: "csrf" }); expect(disconnected.health).toBe("DISCONNECTED"); expect(disconnected.providerRootReference).toBeUndefined();
    await expect(service.sync(actor, { connectedSourceId: source.id, csrfToken: "csrf" })).rejects.toThrow("CONNECTED_SOURCE_NOT_READY");
  });

  it("enforces tenant and CSRF boundaries and creates a memory-only Picker bootstrap", async () => {
    const service = new ConnectedSourceService(new InMemoryConnectedSourceRepository(), new InMemoryFolderCandidateRepository(), { async validate() { throw new Error("not reached"); } }, { async execute() { return summary(); } }); const source = await service.ensureConnection("org", "connection");
    await expect(service.validateFolder({ ...actor, organizationId: "other" }, { connectedSourceId: source.id, csrfToken: "csrf", untrustedFolderId: "x" })).rejects.toThrow("CONNECTED_SOURCE_NOT_FOUND");
    await expect(service.validateFolder(actor, { connectedSourceId: source.id, csrfToken: "wrong", untrustedFolderId: "x" })).rejects.toThrow("CONNECTED_SOURCE_CSRF_REJECTED");
    expect(createGooglePickerBootstrap({ apiKey: "restricted-public-key", appId: "project-number", accessToken: "short-lived", accessTokenExpiresAt: "2999-01-01T00:00:00Z" })).toMatchObject({ view: { id: "FOLDERS", enableSharedDrives: false } });
  });
  it("does not report product failure when checkpoint truth requires terminal reconciliation", async () => {
    const sources = new InMemoryConnectedSourceRepository(); const candidates = new InMemoryFolderCandidateRepository();
    const service = new ConnectedSourceService(sources, candidates, { async validate() { return { providerRootReference: "verified", safeDisplayName: "Facturas", mimeType: "application/vnd.google-apps.folder", trashed: false, location: "MY_DRIVE" }; } }, { async execute() { throw new Error("PILOT_TERMINAL_STATE_RECONCILIATION_REQUIRED"); } });
    const source = await service.ensureConnection("org", "connection"); const candidate = await service.validateFolder(actor, { connectedSourceId: source.id, csrfToken: "csrf", untrustedFolderId: "candidate" }); await service.confirmFolder(actor, { connectedSourceId: source.id, candidateId: candidate.candidateId, csrfToken: "csrf" });
    await expect(service.sync(actor, { connectedSourceId: source.id, csrfToken: "csrf" })).rejects.toThrow("PILOT_TERMINAL_STATE_RECONCILIATION_REQUIRED");
    expect((await sources.find("org", source.id))?.health).toBe("SYNCING");
  });
});
