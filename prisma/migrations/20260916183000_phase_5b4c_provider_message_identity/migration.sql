-- Delivery correlation must resolve to exactly one provider-accepted outcome per tenant.
CREATE UNIQUE INDEX "CommunicationSendOutcome_organizationId_providerMessageId_key"
ON "CommunicationSendOutcome"("organizationId", "providerMessageId");
