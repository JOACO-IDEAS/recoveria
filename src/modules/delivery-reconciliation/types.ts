export type CommunicationDeliveryStatus = "DELIVERED" | "BOUNCED" | "DELIVERY_UNKNOWN";

export interface CommunicationDeliveryEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly providerId: string;
  readonly providerMessageId: string;
  readonly providerEventId: string;
  readonly status: CommunicationDeliveryStatus;
  readonly occurredAt: string;
  readonly evidenceCode: string;
  readonly payloadHash: string;
}

export interface DeliveryCorrelation {
  readonly organizationId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly providerId: string;
  readonly providerMessageId: string;
}

export interface CommunicationDeliveryStore {
  correlate(organizationId: string, providerId: string, providerMessageId: string): Promise<DeliveryCorrelation | undefined>;
  record(event: CommunicationDeliveryEvent): Promise<{ readonly inserted: boolean; readonly event: CommunicationDeliveryEvent }>;
  events(executionId: string): Promise<readonly CommunicationDeliveryEvent[]>;
}
