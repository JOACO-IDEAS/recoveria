import { Prisma, PrismaClient } from "@prisma/client";
import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationDeliveryEvent, CommunicationDeliveryStore } from "./types";

type DbEvent = Awaited<ReturnType<PrismaClient["communicationDeliveryEvent"]["findUniqueOrThrow"]>>;
const eventOf = (row: DbEvent): CommunicationDeliveryEvent => deepFreeze({ id: row.id, organizationId: row.organizationId, executionId: row.executionId, attemptId: row.attemptId, providerId: row.providerId, providerMessageId: row.providerMessageId, providerEventId: row.providerEventId, status: row.status, occurredAt: row.occurredAt.toISOString(), evidenceCode: row.evidenceCode, payloadHash: row.payloadHash });
const same = (left: CommunicationDeliveryEvent, right: CommunicationDeliveryEvent) => JSON.stringify(left) === JSON.stringify(right);

export class PrismaCommunicationDeliveryStore implements CommunicationDeliveryStore {
  constructor(private readonly client: PrismaClient) {}

  async correlate(organizationId: string, providerId: string, providerMessageId: string) {
    const outcome = await this.client.communicationSendOutcome.findUnique({ where: { organizationId_providerMessageId: { organizationId, providerMessageId } }, include: { attempt: true } });
    if (!outcome || outcome.status !== "ACCEPTED" || outcome.attempt.providerId !== providerId) return undefined;
    return deepFreeze({ organizationId, executionId: outcome.attempt.executionId, attemptId: outcome.attemptId, providerId, providerMessageId });
  }

  async record(event: CommunicationDeliveryEvent) {
    try {
      return await this.client.$transaction(async transaction => {
        const where = { organizationId_providerId_providerEventId: { organizationId: event.organizationId, providerId: event.providerId, providerEventId: event.providerEventId } };
        const prior = await transaction.communicationDeliveryEvent.findUnique({ where });
        if (prior) {
          const existing = eventOf(prior);
          if (!same(existing, event)) throw new Error("Conflicting immutable delivery event");
          return deepFreeze({ inserted: false, event: existing });
        }
        const row = await transaction.communicationDeliveryEvent.create({ data: { ...event, occurredAt: new Date(event.occurredAt) } });
        return deepFreeze({ inserted: true, event: eventOf(row) });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const prior = await this.client.communicationDeliveryEvent.findUniqueOrThrow({ where: { organizationId_providerId_providerEventId: { organizationId: event.organizationId, providerId: event.providerId, providerEventId: event.providerEventId } } });
      const existing = eventOf(prior);
      if (!same(existing, event)) throw new Error("Conflicting immutable delivery event");
      return deepFreeze({ inserted: false, event: existing });
    }
  }

  async events(executionId: string) { return Promise.all((await this.client.communicationDeliveryEvent.findMany({ where: { executionId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] })).map(async row => eventOf(row))); }
}
