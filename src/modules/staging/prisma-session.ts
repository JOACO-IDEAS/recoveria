import type { PrismaClient } from "@prisma/client";
import type { StagingSessionRecord, StagingSessionRepository } from "./auth";

export class PrismaStagingSessionRepository implements StagingSessionRepository {
  constructor(private readonly client: PrismaClient) {}
  async create(record: StagingSessionRecord): Promise<void> { await this.client.stagingFounderSession.create({ data: { ...record, expiresAt: new Date(record.expiresAt), revokedAt: record.revokedAt ? new Date(record.revokedAt) : null } }); }
  async load(idHash: string): Promise<StagingSessionRecord | null> { const row = await this.client.stagingFounderSession.findUnique({ where: { idHash } }); return row ? { idHash: row.idHash, organizationId: row.organizationId, actorId: row.actorId, email: row.email, expiresAt: row.expiresAt.toISOString(), revokedAt: row.revokedAt?.toISOString() } : null; }
  async revoke(idHash: string): Promise<void> { await this.client.stagingFounderSession.updateMany({ where: { idHash, revokedAt: null }, data: { revokedAt: new Date() } }); }
}
