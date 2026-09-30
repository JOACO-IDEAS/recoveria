import { Prisma, type PrismaClient } from "@prisma/client";
import type { ConnectedSourceRecord, ConnectedSourceRepository } from "./service";

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
