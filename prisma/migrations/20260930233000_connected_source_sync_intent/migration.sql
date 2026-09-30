CREATE TYPE "ConnectedSourceSyncIntentStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ConnectedSourceSyncIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectedSourceId" TEXT NOT NULL,
    "syncIntentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "sessionBindingHash" TEXT NOT NULL,
    "status" "ConnectedSourceSyncIntentStatus" NOT NULL DEFAULT 'RUNNING',
    "executionId" TEXT NOT NULL,
    "summary" JSONB,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectedSourceSyncIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectedSourceSyncIntent_organizationId_connectedSourceId_syncIntentId_key"
ON "ConnectedSourceSyncIntent"("organizationId", "connectedSourceId", "syncIntentId");
CREATE UNIQUE INDEX "ConnectedSourceSyncIntent_organizationId_syncIntentId_key"
ON "ConnectedSourceSyncIntent"("organizationId", "syncIntentId");
CREATE INDEX "ConnectedSourceSyncIntent_organizationId_connectedSourceId_status_idx"
ON "ConnectedSourceSyncIntent"("organizationId", "connectedSourceId", "status");

ALTER TABLE "ConnectedSourceSyncIntent"
ADD CONSTRAINT "ConnectedSourceSyncIntent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectedSourceSyncIntent"
ADD CONSTRAINT "ConnectedSourceSyncIntent_connectedSourceId_fkey"
FOREIGN KEY ("connectedSourceId") REFERENCES "ConnectedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
