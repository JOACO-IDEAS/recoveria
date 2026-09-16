-- Phase 5B.4B adds a durable, provider-neutral communication execution boundary.
CREATE TYPE "CommunicationExecutionStatus" AS ENUM ('READY', 'ATTEMPTING', 'ACCEPTED', 'FAILED', 'UNKNOWN');
CREATE TYPE "CommunicationAttemptState" AS ENUM ('ATTEMPTING');
CREATE TYPE "CommunicationOutcomeStatus" AS ENUM ('ACCEPTED', 'FAILED', 'UNKNOWN');

CREATE TABLE "CommunicationExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftContentHash" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "approvalActorId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "status" "CommunicationExecutionStatus" NOT NULL DEFAULT 'READY',
    "currentFingerprint" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerRequestKey" TEXT NOT NULL,
    "invoiceIds" TEXT[],
    "targetOutstandingCents" BIGINT NOT NULL,
    "evidenceRefs" TEXT[],
    "revalidatedAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunicationExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationSendAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "state" "CommunicationAttemptState" NOT NULL DEFAULT 'ATTEMPTING',
    "providerId" TEXT,
    "providerRequestKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "fingerprintAtAttempt" TEXT NOT NULL,
    "evidenceRefs" TEXT[],
    CONSTRAINT "CommunicationSendAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationSendOutcome" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "status" "CommunicationOutcomeStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    CONSTRAINT "CommunicationSendOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationExecution_organizationId_draftId_key" ON "CommunicationExecution"("organizationId", "draftId");
CREATE UNIQUE INDEX "CollectionCase_organizationId_id_key" ON "CollectionCase"("organizationId", "id");
CREATE UNIQUE INDEX "CommunicationExecution_organizationId_id_key" ON "CommunicationExecution"("organizationId", "id");
CREATE UNIQUE INDEX "CommunicationExecution_organizationId_idempotencyKey_key" ON "CommunicationExecution"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "CommunicationExecution_organizationId_providerRequestKey_key" ON "CommunicationExecution"("organizationId", "providerRequestKey");
CREATE INDEX "CommunicationExecution_organizationId_status_updatedAt_idx" ON "CommunicationExecution"("organizationId", "status", "updatedAt");
CREATE UNIQUE INDEX "CommunicationSendAttempt_executionId_attemptNumber_key" ON "CommunicationSendAttempt"("executionId", "attemptNumber");
CREATE UNIQUE INDEX "CommunicationSendAttempt_organizationId_id_key" ON "CommunicationSendAttempt"("organizationId", "id");
CREATE INDEX "CommunicationSendAttempt_organizationId_executionId_startedAt_idx" ON "CommunicationSendAttempt"("organizationId", "executionId", "startedAt");
CREATE UNIQUE INDEX "CommunicationSendOutcome_attemptId_key" ON "CommunicationSendOutcome"("attemptId");
CREATE UNIQUE INDEX "CommunicationSendOutcome_organizationId_attemptId_key" ON "CommunicationSendOutcome"("organizationId", "attemptId");
CREATE INDEX "CommunicationSendOutcome_organizationId_status_occurredAt_idx" ON "CommunicationSendOutcome"("organizationId", "status", "occurredAt");

ALTER TABLE "CommunicationExecution" ADD CONSTRAINT "CommunicationExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationExecution" ADD CONSTRAINT "CommunicationExecution_organizationId_caseId_fkey" FOREIGN KEY ("organizationId", "caseId") REFERENCES "CollectionCase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationSendAttempt" ADD CONSTRAINT "CommunicationSendAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationSendAttempt" ADD CONSTRAINT "CommunicationSendAttempt_organizationId_executionId_fkey" FOREIGN KEY ("organizationId", "executionId") REFERENCES "CommunicationExecution"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationSendOutcome" ADD CONSTRAINT "CommunicationSendOutcome_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationSendOutcome" ADD CONSTRAINT "CommunicationSendOutcome_organizationId_attemptId_fkey" FOREIGN KEY ("organizationId", "attemptId") REFERENCES "CommunicationSendAttempt"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
