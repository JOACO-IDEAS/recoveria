CREATE TYPE "DriveConnectionLifecycleState" AS ENUM ('DISCONNECTED', 'AUTHORIZATION_PENDING', 'CONNECTED', 'REAUTHORIZATION_REQUIRED', 'REVOKED');
CREATE TYPE "DrivePilotExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'ABORTED');

CREATE TABLE "DriveOAuthState" ("stateHash" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "operatorId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "nonceHash" TEXT NOT NULL, "callbackUrl" TEXT NOT NULL, "schemaVersion" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), CONSTRAINT "DriveOAuthState_pkey" PRIMARY KEY ("stateHash"));
CREATE INDEX "DriveOAuthState_organizationId_connectionId_expiresAt_idx" ON "DriveOAuthState"("organizationId", "connectionId", "expiresAt");

CREATE TABLE "DriveConnectionState" ("organizationId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "state" "DriveConnectionLifecycleState" NOT NULL DEFAULT 'DISCONNECTED', "revision" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DriveConnectionState_pkey" PRIMARY KEY ("organizationId", "connectionId"));
CREATE INDEX "DriveConnectionState_organizationId_state_idx" ON "DriveConnectionState"("organizationId", "state");

CREATE TABLE "DriveCredentialEnvelope" ("organizationId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "encryptedRefreshCredential" BYTEA NOT NULL, "keyId" TEXT NOT NULL, "keyVersion" TEXT NOT NULL, "grantedScopes" TEXT[], "providerSubject" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DriveCredentialEnvelope_pkey" PRIMARY KEY ("organizationId", "connectionId"));

CREATE TABLE "DriveSecurityAuditEvent" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "executionId" TEXT NOT NULL, "documentReference" TEXT NOT NULL, "eventType" TEXT NOT NULL, "operation" TEXT NOT NULL, "outcome" TEXT NOT NULL, "failureClassification" TEXT, "rootProof" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DriveSecurityAuditEvent_pkey" PRIMARY KEY ("id"));
CREATE INDEX "DriveSecurityAuditEvent_organizationId_connectionId_executionId_occurredAt_idx" ON "DriveSecurityAuditEvent"("organizationId", "connectionId", "executionId", "occurredAt");
CREATE INDEX "DriveSecurityAuditEvent_organizationId_outcome_occurredAt_idx" ON "DriveSecurityAuditEvent"("organizationId", "outcome", "occurredAt");

CREATE TABLE "DriveSourceCheckpoint" ("organizationId" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "processingVersion" TEXT NOT NULL, "checkpoint" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DriveSourceCheckpoint_pkey" PRIMARY KEY ("organizationId", "sourceType", "sourceId", "connectionId"));

CREATE TABLE "DrivePilotExecution" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "authorizedRootId" TEXT NOT NULL, "status" "DrivePilotExecutionStatus" NOT NULL DEFAULT 'PENDING', "configurationVersion" TEXT NOT NULL, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "failureClassification" TEXT, "discoveredCount" INTEGER NOT NULL DEFAULT 0, "downloadedCount" INTEGER NOT NULL DEFAULT 0, "pageCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DrivePilotExecution_pkey" PRIMARY KEY ("id"));
CREATE INDEX "DrivePilotExecution_organizationId_connectionId_status_idx" ON "DrivePilotExecution"("organizationId", "connectionId", "status");
CREATE INDEX "DrivePilotExecution_organizationId_createdAt_idx" ON "DrivePilotExecution"("organizationId", "createdAt");
CREATE UNIQUE INDEX "DrivePilotExecution_one_active_per_connection" ON "DrivePilotExecution"("organizationId", "connectionId") WHERE "status" IN ('PENDING', 'RUNNING');
