-- Phase 5B.4C separates provider acceptance from immutable delivery observations.
CREATE TYPE "CommunicationDeliveryStatus" AS ENUM ('DELIVERED', 'BOUNCED', 'DELIVERY_UNKNOWN');

ALTER TABLE "CommunicationSendOutcome" ADD COLUMN "providerMessageId" TEXT;

CREATE UNIQUE INDEX "CommunicationSendAttempt_organizationId_executionId_id_key"
ON "CommunicationSendAttempt"("organizationId", "executionId", "id");

CREATE TABLE "CommunicationDeliveryEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "status" "CommunicationDeliveryStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "evidenceCode" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationDeliveryEvent_organizationId_providerId_providerEventId_key"
ON "CommunicationDeliveryEvent"("organizationId", "providerId", "providerEventId");
CREATE INDEX "CommunicationDeliveryEvent_organizationId_executionId_occurredAt_idx"
ON "CommunicationDeliveryEvent"("organizationId", "executionId", "occurredAt");
CREATE INDEX "CommunicationDeliveryEvent_organizationId_providerId_providerMessageId_idx"
ON "CommunicationDeliveryEvent"("organizationId", "providerId", "providerMessageId");

ALTER TABLE "CommunicationDeliveryEvent" ADD CONSTRAINT "CommunicationDeliveryEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationDeliveryEvent" ADD CONSTRAINT "CommunicationDeliveryEvent_organizationId_executionId_fkey"
FOREIGN KEY ("organizationId", "executionId") REFERENCES "CommunicationExecution"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationDeliveryEvent" ADD CONSTRAINT "CommunicationDeliveryEvent_organizationId_executionId_attemptId_fkey"
FOREIGN KEY ("organizationId", "executionId", "attemptId") REFERENCES "CommunicationSendAttempt"("organizationId", "executionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
