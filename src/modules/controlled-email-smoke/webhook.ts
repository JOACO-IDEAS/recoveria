import type { ResendDeliveryWebhookService } from "@/modules/delivery-reconciliation";
import { CONTROLLED_SMOKE } from "./constants";

export class ControlledSmokeResendWebhookAdapter {
  constructor(private readonly service: ResendDeliveryWebhookService) {}
  ingest(input: { readonly rawBody: string; readonly eventId?: string; readonly timestamp?: string; readonly signature?: string; readonly organizationId?: never }) {
    if ("organizationId" in input) throw new Error("Controlled smoke webhook does not accept caller tenant identity");
    return this.service.ingest({ organizationId: CONTROLLED_SMOKE.organizationId, rawBody: input.rawBody, eventId: input.eventId, timestamp: input.timestamp, signature: input.signature });
  }
}
