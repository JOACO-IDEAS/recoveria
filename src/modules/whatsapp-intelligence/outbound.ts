export interface AuthorizedWhatsAppOutboundMessage {
  readonly organizationId: string;
  readonly businessPhoneNumberId: string;
  readonly recipientPhone: string;
  readonly authorizationRef: string;
  readonly templateName?: string;
  readonly text?: string;
}

export interface WhatsAppOutboundPort {
  send(message: AuthorizedWhatsAppOutboundMessage): Promise<{ readonly providerMessageId: string }>;
}

/** Default for V1.1: the port exists, but no real outbound capability is enabled. */
export class DisabledWhatsAppOutboundAdapter implements WhatsAppOutboundPort {
  async send(message: AuthorizedWhatsAppOutboundMessage): Promise<never> {
    void message;
    throw new Error("WHATSAPP_OUTBOUND_DISABLED");
  }
}
