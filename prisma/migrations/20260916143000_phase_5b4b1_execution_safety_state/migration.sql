CREATE TABLE "CommunicationExecutionSafetyState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "safetyFingerprint" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunicationExecutionSafetyState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationExecutionSafetyState_organizationId_caseId_key" ON "CommunicationExecutionSafetyState"("organizationId", "caseId");
CREATE INDEX "CommunicationExecutionSafetyState_organizationId_updatedAt_idx" ON "CommunicationExecutionSafetyState"("organizationId", "updatedAt");

ALTER TABLE "CommunicationExecutionSafetyState" ADD CONSTRAINT "CommunicationExecutionSafetyState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationExecutionSafetyState" ADD CONSTRAINT "CommunicationExecutionSafetyState_organizationId_caseId_fkey" FOREIGN KEY ("organizationId", "caseId") REFERENCES "CollectionCase"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
