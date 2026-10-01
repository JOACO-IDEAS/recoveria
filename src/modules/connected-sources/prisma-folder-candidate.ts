import type { PrismaClient } from "@prisma/client";
import type { FolderCandidate, FolderCandidateRepository } from "./service";

export class PrismaFolderCandidateRepository implements FolderCandidateRepository {
  constructor(private readonly client: PrismaClient, private readonly connectedSourceId: string) {}
  async create(candidate: FolderCandidate): Promise<void> {
    await this.client.connectedSourceFolderCandidate.create({ data: { id: candidate.candidateId, organizationId: candidate.organizationId, connectedSourceId: this.connectedSourceId, providerConnectionId: candidate.connectionId, actorId: candidate.actorId, sessionBindingHash: candidate.sessionBindingHash, providerRootReference: candidate.providerRootReference, safeDisplayName: candidate.safeDisplayName, expiresAt: new Date(candidate.expiresAt) } });
  }
  async consume(input: { organizationId: string; connectionId: string; candidateId: string; actorId: string; sessionBindingHash: string; now: string }): Promise<FolderCandidate | null> {
    const now = new Date(input.now);
    const updated = await this.client.connectedSourceFolderCandidate.updateMany({ where: { id: input.candidateId, organizationId: input.organizationId, providerConnectionId: input.connectionId, actorId: input.actorId, sessionBindingHash: input.sessionBindingHash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (updated.count !== 1) return null;
    const row = await this.client.connectedSourceFolderCandidate.findUniqueOrThrow({ where: { id: input.candidateId } });
    return { candidateId: row.id, organizationId: row.organizationId, connectionId: row.providerConnectionId, actorId: row.actorId, sessionBindingHash: row.sessionBindingHash, providerRootReference: row.providerRootReference, safeDisplayName: row.safeDisplayName, expiresAt: row.expiresAt.toISOString(), consumedAt: row.consumedAt?.toISOString() };
  }
}
