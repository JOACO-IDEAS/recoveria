-- Additive-only WhatsApp Intelligence V1 persistence.
-- This migration is prepared for review and MUST NOT be applied to staging or
-- any future production database without an explicit environment authorization.

CREATE TYPE "WhatsAppMessageKind" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'UNSUPPORTED');
CREATE TYPE "WhatsAppProcessingStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRY', 'FAILED');

CREATE TABLE "WhatsAppBusinessNumber" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "phoneNumberId" TEXT NOT NULL,
  "displayPhone" TEXT, "retentionDays" INTEGER NOT NULL DEFAULT 90, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppBusinessNumber_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppConversation" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "businessNumberId" TEXT NOT NULL,
  "senderPhoneHash" TEXT NOT NULL, "senderPhoneCipher" TEXT NOT NULL, "lastMessageAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppInboundMessage" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "businessNumberId" TEXT NOT NULL, "conversationId" TEXT NOT NULL,
  "metaMessageId" TEXT NOT NULL, "kind" "WhatsAppMessageKind" NOT NULL, "senderDisplayNameCipher" TEXT, "textCipher" TEXT,
  "mediaMetadata" JSONB, "receivedAt" TIMESTAMP(3) NOT NULL, "payloadHash" TEXT NOT NULL, "purgeAfter" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WhatsAppInboundMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppProcessingJob" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "messageId" TEXT NOT NULL,
  "status" "WhatsAppProcessingStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppProcessingJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppInterpretation" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "schemaVersion" TEXT NOT NULL,
  "provider" TEXT NOT NULL, "model" TEXT NOT NULL, "output" JSONB NOT NULL, "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL, "totalTokens" INTEGER NOT NULL, "estimatedCostUsdMicros" INTEGER NOT NULL,
  "latencyMs" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppInterpretation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppCrmCandidateEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "messageId" TEXT NOT NULL, "caseId" TEXT, "partyId" TEXT,
  "invoiceIds" TEXT[] NOT NULL, "type" TEXT NOT NULL, "reportedAmountMinor" BIGINT, "reportedCurrency" TEXT,
  "remainingCommitmentMinor" BIGINT, "promisedFor" TEXT, "accreditationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING', "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "warnings" TEXT[] NOT NULL, "evidenceRefs" TEXT[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppCrmCandidateEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppAuditEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "action" TEXT NOT NULL, "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL, "outcome" TEXT NOT NULL, "failureCode" TEXT, "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WhatsAppAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppBusinessNumber_phoneNumberId_key" ON "WhatsAppBusinessNumber"("phoneNumberId");
CREATE UNIQUE INDEX "WhatsAppBusinessNumber_organizationId_id_key" ON "WhatsAppBusinessNumber"("organizationId", "id");
CREATE INDEX "WhatsAppBusinessNumber_organizationId_active_idx" ON "WhatsAppBusinessNumber"("organizationId", "active");
CREATE UNIQUE INDEX "WhatsAppConversation_organizationId_businessNumberId_senderPhoneHash_key" ON "WhatsAppConversation"("organizationId", "businessNumberId", "senderPhoneHash");
CREATE UNIQUE INDEX "WhatsAppConversation_organizationId_id_key" ON "WhatsAppConversation"("organizationId", "id");
CREATE INDEX "WhatsAppConversation_organizationId_lastMessageAt_idx" ON "WhatsAppConversation"("organizationId", "lastMessageAt");
CREATE UNIQUE INDEX "WhatsAppInboundMessage_metaMessageId_key" ON "WhatsAppInboundMessage"("metaMessageId");
CREATE UNIQUE INDEX "WhatsAppInboundMessage_organizationId_metaMessageId_key" ON "WhatsAppInboundMessage"("organizationId", "metaMessageId");
CREATE UNIQUE INDEX "WhatsAppInboundMessage_organizationId_id_key" ON "WhatsAppInboundMessage"("organizationId", "id");
CREATE INDEX "WhatsAppInboundMessage_organizationId_conversationId_receivedAt_idx" ON "WhatsAppInboundMessage"("organizationId", "conversationId", "receivedAt");
CREATE INDEX "WhatsAppInboundMessage_organizationId_purgeAfter_idx" ON "WhatsAppInboundMessage"("organizationId", "purgeAfter");
CREATE UNIQUE INDEX "WhatsAppProcessingJob_messageId_key" ON "WhatsAppProcessingJob"("messageId");
CREATE UNIQUE INDEX "WhatsAppProcessingJob_organizationId_id_key" ON "WhatsAppProcessingJob"("organizationId", "id");
CREATE UNIQUE INDEX "WhatsAppProcessingJob_organizationId_messageId_key" ON "WhatsAppProcessingJob"("organizationId", "messageId");
CREATE INDEX "WhatsAppProcessingJob_organizationId_status_nextAttemptAt_idx" ON "WhatsAppProcessingJob"("organizationId", "status", "nextAttemptAt");
CREATE UNIQUE INDEX "WhatsAppInterpretation_messageId_key" ON "WhatsAppInterpretation"("messageId");
CREATE UNIQUE INDEX "WhatsAppInterpretation_organizationId_id_key" ON "WhatsAppInterpretation"("organizationId", "id");
CREATE UNIQUE INDEX "WhatsAppInterpretation_organizationId_messageId_key" ON "WhatsAppInterpretation"("organizationId", "messageId");
CREATE INDEX "WhatsAppInterpretation_organizationId_createdAt_idx" ON "WhatsAppInterpretation"("organizationId", "createdAt");
CREATE UNIQUE INDEX "WhatsAppCrmCandidateEvent_messageId_key" ON "WhatsAppCrmCandidateEvent"("messageId");
CREATE UNIQUE INDEX "WhatsAppCrmCandidateEvent_organizationId_id_key" ON "WhatsAppCrmCandidateEvent"("organizationId", "id");
CREATE UNIQUE INDEX "WhatsAppCrmCandidateEvent_organizationId_messageId_key" ON "WhatsAppCrmCandidateEvent"("organizationId", "messageId");
CREATE INDEX "WhatsAppCrmCandidateEvent_organizationId_type_createdAt_idx" ON "WhatsAppCrmCandidateEvent"("organizationId", "type", "createdAt");
CREATE INDEX "WhatsAppCrmCandidateEvent_organizationId_reviewRequired_createdAt_idx" ON "WhatsAppCrmCandidateEvent"("organizationId", "reviewRequired", "createdAt");
CREATE INDEX "WhatsAppAuditEvent_organizationId_occurredAt_idx" ON "WhatsAppAuditEvent"("organizationId", "occurredAt");
CREATE INDEX "WhatsAppAuditEvent_organizationId_action_outcome_idx" ON "WhatsAppAuditEvent"("organizationId", "action", "outcome");

ALTER TABLE "WhatsAppBusinessNumber" ADD CONSTRAINT "WhatsAppBusinessNumber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_businessNumberId_fkey" FOREIGN KEY ("businessNumberId") REFERENCES "WhatsAppBusinessNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundMessage" ADD CONSTRAINT "WhatsAppInboundMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundMessage" ADD CONSTRAINT "WhatsAppInboundMessage_businessNumberId_fkey" FOREIGN KEY ("businessNumberId") REFERENCES "WhatsAppBusinessNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundMessage" ADD CONSTRAINT "WhatsAppInboundMessage_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "WhatsAppConversation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppProcessingJob" ADD CONSTRAINT "WhatsAppProcessingJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppProcessingJob" ADD CONSTRAINT "WhatsAppProcessingJob_organizationId_messageId_fkey" FOREIGN KEY ("organizationId", "messageId") REFERENCES "WhatsAppInboundMessage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInterpretation" ADD CONSTRAINT "WhatsAppInterpretation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInterpretation" ADD CONSTRAINT "WhatsAppInterpretation_organizationId_messageId_fkey" FOREIGN KEY ("organizationId", "messageId") REFERENCES "WhatsAppInboundMessage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCrmCandidateEvent" ADD CONSTRAINT "WhatsAppCrmCandidateEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCrmCandidateEvent" ADD CONSTRAINT "WhatsAppCrmCandidateEvent_organizationId_messageId_fkey" FOREIGN KEY ("organizationId", "messageId") REFERENCES "WhatsAppInboundMessage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAuditEvent" ADD CONSTRAINT "WhatsAppAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
