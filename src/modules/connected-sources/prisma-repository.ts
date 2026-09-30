import { Prisma, type PrismaClient } from "@prisma/client";
import type { ConnectedSourceRecord, ConnectedSourceRepository, SyncIntentRecord, SyncIntentRepository } from "./service";
import type { ConnectedSourceSyncSummary } from "./product-contract";

const fromRow = (row: Awaited<ReturnType<PrismaClient["connectedSource"]["findUnique"]>> & {}): ConnectedSourceRecord => ({
  id: row.id, organizationId: row.organizationId, provider: row.provider, providerConnectionId: row.providerConnectionId,
  providerRootReference: row.providerRootReference ?? undefined, rootDisplayName: row.rootDisplayName ?? undefined,
  rootConfirmedBy: row.rootConfirmedBy ?? undefined, rootConfirmedAt: row.rootConfirmedAt?.toISOString(), rootBoundaryVersion: row.rootBoundaryVersion,
  health: row.health, lastAttemptedSyncAt: row.lastAttemptedSyncAt?.toISOString(), lastSuccessfulSyncAt: row.lastSuccessfulSyncAt?.toISOString(),
  committedDocumentCount: row.committedDocumentCount, reviewRequiredCount: row.reviewRequiredCount, revision: row.revision,
});

export class PrismaConnectedSourceRepository implements ConnectedSourceRepository {
  constructor(private readonly client: PrismaClient) {}
  async find(organizationId: string, id: string): Promise<ConnectedSourceRecord | null> { const row = await this.client.connectedSource.findFirst({ where: { id, organizationId } }); return row ? fromRow(row) : null; }
  async findByConnection(organizationId: string, connectionId: string): Promise<ConnectedSourceRecord | null> { const row = await this.client.connectedSource.findUnique({ where: { organizationId_provider_providerConnectionId: { organizationId, provider: "GOOGLE_DRIVE", providerConnectionId: connectionId } } }); return row ? fromRow(row) : null; }
  async save(record: ConnectedSourceRecord, expectedRevision: number | null): Promise<ConnectedSourceRecord> {
    const data = { providerConnectionId: record.providerConnectionId, providerRootReference: record.providerRootReference ?? null, rootDisplayName: record.rootDisplayName ?? null, rootConfirmedBy: record.rootConfirmedBy ?? null, rootConfirmedAt: record.rootConfirmedAt ? new Date(record.rootConfirmedAt) : null, rootBoundaryVersion: record.rootBoundaryVersion, health: record.health, lastAttemptedSyncAt: record.lastAttemptedSyncAt ? new Date(record.lastAttemptedSyncAt) : null, lastSuccessfulSyncAt: record.lastSuccessfulSyncAt ? new Date(record.lastSuccessfulSyncAt) : null, committedDocumentCount: record.committedDocumentCount, reviewRequiredCount: record.reviewRequiredCount };
    if (expectedRevision === null) {
      try { return fromRow(await this.client.connectedSource.create({ data: { id: record.id, organizationId: record.organizationId, provider: record.provider, ...data } })); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("CONNECTED_SOURCE_OPTIMISTIC_LOCK_CONFLICT"); throw error; }
    }
    const updated = await this.client.connectedSource.updateMany({ where: { id: record.id, organizationId: record.organizationId, revision: expectedRevision }, data: { ...data, revision: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("CONNECTED_SOURCE_OPTIMISTIC_LOCK_CONFLICT");
    const row = await this.client.connectedSource.findUniqueOrThrow({ where: { id: record.id } }); return fromRow(row);
  }
}

const syncIntentFromRow = (row: { organizationId: string; connectedSourceId: string; syncIntentId: string; actorId: string; sessionBindingHash: string; executionId: string; status: "RUNNING" | "SUCCEEDED" | "FAILED"; summary: unknown; failureCode: string | null }): SyncIntentRecord => ({ organizationId: row.organizationId, connectedSourceId: row.connectedSourceId, syncIntentId: row.syncIntentId, actorId: row.actorId, sessionBindingHash: row.sessionBindingHash, executionId: row.executionId, status: row.status, ...(row.summary ? { summary: row.summary as ConnectedSourceSyncSummary } : {}), ...(row.failureCode ? { failureCode: row.failureCode } : {}) });

export class PrismaSyncIntentRepository implements SyncIntentRepository {
  constructor(private readonly client: PrismaClient) {}
  async claim(record: SyncIntentRecord): Promise<{ created: boolean; record: SyncIntentRecord }> {
    try { const row = await this.client.connectedSourceSyncIntent.create({ data: { organizationId: record.organizationId, connectedSourceId: record.connectedSourceId, syncIntentId: record.syncIntentId, actorId: record.actorId, sessionBindingHash: record.sessionBindingHash, executionId: record.executionId, status: "RUNNING" } }); return { created: true, record: syncIntentFromRow(row) }; }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error; const row = await this.client.connectedSourceSyncIntent.findUniqueOrThrow({ where: { organizationId_syncIntentId: { organizationId: record.organizationId, syncIntentId: record.syncIntentId } } }); return { created: false, record: syncIntentFromRow(row) }; }
  }
  async complete(input: { organizationId: string; connectedSourceId: string; syncIntentId: string; status: "SUCCEEDED" | "FAILED"; summary?: ConnectedSourceSyncSummary; failureCode?: string }): Promise<SyncIntentRecord> {
    const result = await this.client.connectedSourceSyncIntent.updateMany({ where: { organizationId: input.organizationId, connectedSourceId: input.connectedSourceId, syncIntentId: input.syncIntentId, status: "RUNNING" }, data: { status: input.status, summary: input.summary as Prisma.InputJsonValue | undefined, failureCode: input.failureCode ?? null, completedAt: new Date() } });
    if (result.count !== 1) throw new Error("CONNECTED_SOURCE_SYNC_INTENT_STATE_CONFLICT");
    return syncIntentFromRow(await this.client.connectedSourceSyncIntent.findUniqueOrThrow({ where: { organizationId_connectedSourceId_syncIntentId: { organizationId: input.organizationId, connectedSourceId: input.connectedSourceId, syncIntentId: input.syncIntentId } } }));
  }
}
