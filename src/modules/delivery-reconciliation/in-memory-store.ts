import { deepFreeze } from "@/lib/domain/evidence";
import type { CommunicationDeliveryEvent, CommunicationDeliveryStore, DeliveryCorrelation } from "./types";

const clone = <T>(value: T): T => deepFreeze(structuredClone(value)) as T;

export class InMemoryCommunicationDeliveryStore implements CommunicationDeliveryStore {
  private readonly correlations = new Map<string, DeliveryCorrelation>();
  private readonly byEvent = new Map<string, CommunicationDeliveryEvent>();
  addCorrelation(value: DeliveryCorrelation): void { this.correlations.set(`${value.organizationId}\0${value.providerId}\0${value.providerMessageId}`, clone(value)); }
  async correlate(organizationId: string, providerId: string, providerMessageId: string) { const value = this.correlations.get(`${organizationId}\0${providerId}\0${providerMessageId}`); return value ? clone(value) : undefined; }
  async record(event: CommunicationDeliveryEvent) {
    const key = `${event.organizationId}\0${event.providerId}\0${event.providerEventId}`;
    const prior = this.byEvent.get(key);
    if (prior) {
      if (JSON.stringify(prior) !== JSON.stringify(event)) throw new Error("Conflicting immutable delivery event");
      return clone({ inserted: false, event: prior });
    }
    this.byEvent.set(key, clone(event));
    return clone({ inserted: true, event });
  }
  async events(executionId: string) { return clone([...this.byEvent.values()].filter(event => event.executionId === executionId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))); }
}
