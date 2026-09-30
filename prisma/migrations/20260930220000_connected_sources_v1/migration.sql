CREATE TYPE "ConnectedSourceProvider" AS ENUM ('GOOGLE_DRIVE');
CREATE TYPE "ConnectedSourceHealth" AS ENUM ('NOT_CONFIGURED', 'READY', 'SYNCING', 'UP_TO_DATE', 'REVIEW_REQUIRED', 'ERROR', 'DISCONNECTED');

CREATE TABLE "ConnectedSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "ConnectedSourceProvider" NOT NULL,
    "providerConnectionId" TEXT NOT NULL,
    "providerRootReference" TEXT,
    "rootDisplayName" TEXT,
    "rootConfirmedBy" TEXT,
    "rootConfirmedAt" TIMESTAMP(3),
    "rootBoundaryVersion" INTEGER NOT NULL DEFAULT 0,
    "health" "ConnectedSourceHealth" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastAttemptedSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "committedDocumentCount" INTEGER NOT NULL DEFAULT 0,
    "reviewRequiredCount" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectedSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectedSource_organizationId_provider_providerConnectionId_key"
ON "ConnectedSource"("organizationId", "provider", "providerConnectionId");
CREATE INDEX "ConnectedSource_organizationId_health_idx"
ON "ConnectedSource"("organizationId", "health");
ALTER TABLE "ConnectedSource" ADD CONSTRAINT "ConnectedSource_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
