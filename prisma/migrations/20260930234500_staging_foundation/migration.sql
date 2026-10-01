CREATE TYPE "StagingSyncTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "StagingFounderSession" (
  "idHash" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StagingFounderSession_pkey" PRIMARY KEY ("idHash")
);

CREATE TABLE "ConnectedSourceFolderCandidate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "connectedSourceId" TEXT NOT NULL,
  "providerConnectionId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "sessionBindingHash" TEXT NOT NULL,
  "providerRootReference" TEXT NOT NULL,
  "safeDisplayName" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectedSourceFolderCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StagingSyncTask" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "connectedSourceId" TEXT NOT NULL,
  "syncIntentId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "deterministicTaskName" TEXT NOT NULL,
  "status" "StagingSyncTaskStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StagingSyncTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StagingFounderSession_organizationId_actorId_expiresAt_idx" ON "StagingFounderSession"("organizationId", "actorId", "expiresAt");
CREATE INDEX "ConnectedSourceFolderCandidate_organizationId_connectedSourceId_expiresAt_idx" ON "ConnectedSourceFolderCandidate"("organizationId", "connectedSourceId", "expiresAt");
CREATE UNIQUE INDEX "StagingSyncTask_deterministicTaskName_key" ON "StagingSyncTask"("deterministicTaskName");
CREATE UNIQUE INDEX "StagingSyncTask_organizationId_syncIntentId_key" ON "StagingSyncTask"("organizationId", "syncIntentId");
CREATE INDEX "StagingSyncTask_organizationId_status_createdAt_idx" ON "StagingSyncTask"("organizationId", "status", "createdAt");

ALTER TABLE "StagingFounderSession" ADD CONSTRAINT "StagingFounderSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectedSourceFolderCandidate" ADD CONSTRAINT "ConnectedSourceFolderCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectedSourceFolderCandidate" ADD CONSTRAINT "ConnectedSourceFolderCandidate_connectedSourceId_fkey" FOREIGN KEY ("connectedSourceId") REFERENCES "ConnectedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StagingSyncTask" ADD CONSTRAINT "StagingSyncTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StagingSyncTask" ADD CONSTRAINT "StagingSyncTask_connectedSourceId_fkey" FOREIGN KEY ("connectedSourceId") REFERENCES "ConnectedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
