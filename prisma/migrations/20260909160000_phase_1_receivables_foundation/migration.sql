-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'OPERATOR', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('ISSUER', 'DEBTOR', 'ADMINISTRATION');

-- CreateEnum
CREATE TYPE "ContactPointType" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('CREATED', 'PROCESSING', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ConfirmationState" AS ENUM ('RAW', 'NORMALIZED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResolutionTargetType" AS ENUM ('PARTY', 'BUILDING', 'CONTACT');

-- CreateEnum
CREATE TYPE "ResolutionDecisionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'NO_MATCH');

-- CreateEnum
CREATE TYPE "InvoiceState" AS ENUM ('ISSUED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceivableEntryType" AS ENUM ('INVOICE_ISSUED', 'PAYMENT', 'ADJUSTMENT', 'CREDIT', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "CollectionCaseStatus" AS ENUM ('OPEN', 'ON_HOLD', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CollectionEventType" AS ENUM ('CASE_OPENED', 'INVOICE_OVERDUE', 'FOLLOW_UP_PREPARED', 'FOLLOW_UP_APPROVED', 'MESSAGE_SENT', 'NO_RESPONSE', 'RESPONSE_RECEIVED', 'PROMISE_RECORDED', 'PROMISE_MISSED', 'INVOICE_DISPUTED', 'PARTIAL_PAYMENT', 'HUMAN_REVIEW_REQUESTED', 'LEGAL_REVIEW_SUGGESTED', 'NOTE');

-- CreateEnum
CREATE TYPE "PromiseStatus" AS ENUM ('OPEN', 'KEPT', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewTaskType" AS ENUM ('EXTRACTION', 'ENTITY_RESOLUTION', 'FINANCIAL', 'CONTACT', 'LEGAL');

-- CreateEnum
CREATE TYPE "ReviewTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "LegalReviewFlagStatus" AS ENUM ('RECOMMENDED', 'IN_REVIEW', 'CLEARED', 'ESCALATED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "taxId" TEXT,
    "roles" "PartyRole"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "taxId" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministrationBuilding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "administrationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "evidenceRef" TEXT,

    CONSTRAINT "AdministrationBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" "ContactPointType" NOT NULL,
    "value" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAssociation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "partyId" TEXT,
    "buildingId" TEXT,
    "purpose" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "evidenceRef" TEXT,

    CONSTRAINT "ContactAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionResult" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL,
    "strategy" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedField" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "extractionResultId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "normalizedValue" JSONB,
    "state" "ConfirmationState" NOT NULL DEFAULT 'RAW',
    "confidence" DECIMAL(5,4),
    "sourceLocation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityResolutionEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "extractedFieldId" TEXT NOT NULL,
    "targetType" "ResolutionTargetType" NOT NULL,
    "candidatePartyId" TEXT,
    "candidateBuildingId" TEXT,
    "candidateContactId" TEXT,
    "method" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "features" JSONB NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityResolutionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityResolutionDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "extractedFieldId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "status" "ResolutionDecisionStatus" NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "reason" TEXT,
    "supersedesId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityResolutionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "issuerPartyId" TEXT NOT NULL,
    "billedToPartyId" TEXT,
    "buildingId" TEXT,
    "sourceDocumentId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "state" "InvoiceState" NOT NULL DEFAULT 'ISSUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivableLedgerEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "type" "ReceivableEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversesEntryId" TEXT,

    CONSTRAINT "ReceivableLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "partyId" TEXT,
    "buildingId" TEXT,
    "currency" CHAR(3) NOT NULL,
    "status" "CollectionCaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionCaseReceivable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionCaseReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "CollectionEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "CollectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromiseToPay" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "promisedFor" TIMESTAMP(3) NOT NULL,
    "status" "PromiseStatus" NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,

    CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT,
    "type" "ReviewTaskType" NOT NULL,
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'OPEN',
    "reasonCode" TEXT NOT NULL,
    "evidenceRefs" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalReviewFlag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT,
    "receivableId" TEXT,
    "status" "LegalReviewFlagStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "policyKey" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "observedDays" INTEGER NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "evidenceRefs" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "LegalReviewFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_active_idx" ON "Membership"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Party_organizationId_normalizedName_idx" ON "Party"("organizationId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Party_organizationId_id_key" ON "Party"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Party_organizationId_taxId_key" ON "Party"("organizationId", "taxId");

-- CreateIndex
CREATE INDEX "Building_organizationId_normalizedName_idx" ON "Building"("organizationId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Building_organizationId_id_key" ON "Building"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Building_organizationId_taxId_key" ON "Building"("organizationId", "taxId");

-- CreateIndex
CREATE INDEX "AdministrationBuilding_organizationId_buildingId_validTo_idx" ON "AdministrationBuilding"("organizationId", "buildingId", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrationBuilding_organizationId_administrationId_buil_key" ON "AdministrationBuilding"("organizationId", "administrationId", "buildingId", "validFrom");

-- CreateIndex
CREATE INDEX "Contact_organizationId_displayName_idx" ON "Contact"("organizationId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_id_key" ON "Contact"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ContactPoint_organizationId_contactId_idx" ON "ContactPoint"("organizationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactPoint_organizationId_type_value_key" ON "ContactPoint"("organizationId", "type", "value");

-- CreateIndex
CREATE INDEX "ContactAssociation_organizationId_partyId_validTo_idx" ON "ContactAssociation"("organizationId", "partyId", "validTo");

-- CreateIndex
CREATE INDEX "ContactAssociation_organizationId_buildingId_validTo_idx" ON "ContactAssociation"("organizationId", "buildingId", "validTo");

-- CreateIndex
CREATE INDEX "ImportBatch_organizationId_status_idx" ON "ImportBatch"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_organizationId_idempotencyKey_key" ON "ImportBatch"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SourceDocument_organizationId_importBatchId_idx" ON "SourceDocument"("organizationId", "importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_organizationId_contentHash_key" ON "SourceDocument"("organizationId", "contentHash");

-- CreateIndex
CREATE INDEX "ExtractionResult_organizationId_sourceDocumentId_createdAt_idx" ON "ExtractionResult"("organizationId", "sourceDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtractedField_organizationId_extractionResultId_fieldName_idx" ON "ExtractedField"("organizationId", "extractionResultId", "fieldName");

-- CreateIndex
CREATE INDEX "EntityResolutionEvidence_organizationId_extractedFieldId_ra_idx" ON "EntityResolutionEvidence"("organizationId", "extractedFieldId", "rank");

-- CreateIndex
CREATE INDEX "EntityResolutionDecision_organizationId_extractedFieldId_de_idx" ON "EntityResolutionDecision"("organizationId", "extractedFieldId", "decidedAt");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_dueAt_idx" ON "Invoice"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_billedToPartyId_idx" ON "Invoice"("organizationId", "billedToPartyId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_buildingId_idx" ON "Invoice"("organizationId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_issuerPartyId_invoiceNumber_key" ON "Invoice"("organizationId", "issuerPartyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_invoiceId_key" ON "Receivable"("invoiceId");

-- CreateIndex
CREATE INDEX "Receivable_organizationId_currency_openedAt_idx" ON "Receivable"("organizationId", "currency", "openedAt");

-- CreateIndex
CREATE INDEX "ReceivableLedgerEntry_organizationId_receivableId_effective_idx" ON "ReceivableLedgerEntry"("organizationId", "receivableId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableLedgerEntry_organizationId_idempotencyKey_key" ON "ReceivableLedgerEntry"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CollectionCase_organizationId_status_currency_idx" ON "CollectionCase"("organizationId", "status", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionCaseReceivable_organizationId_caseId_receivableId_key" ON "CollectionCaseReceivable"("organizationId", "caseId", "receivableId");

-- CreateIndex
CREATE INDEX "CollectionEvent_organizationId_caseId_occurredAt_idx" ON "CollectionEvent"("organizationId", "caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "PromiseToPay_organizationId_status_promisedFor_idx" ON "PromiseToPay"("organizationId", "status", "promisedFor");

-- CreateIndex
CREATE INDEX "ReviewTask_organizationId_status_type_idx" ON "ReviewTask"("organizationId", "status", "type");

-- CreateIndex
CREATE INDEX "LegalReviewFlag_organizationId_status_asOf_idx" ON "LegalReviewFlag"("organizationId", "status", "asOf");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrationBuilding" ADD CONSTRAINT "AdministrationBuilding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrationBuilding" ADD CONSTRAINT "AdministrationBuilding_administrationId_fkey" FOREIGN KEY ("administrationId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrationBuilding" ADD CONSTRAINT "AdministrationBuilding_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAssociation" ADD CONSTRAINT "ContactAssociation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAssociation" ADD CONSTRAINT "ContactAssociation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAssociation" ADD CONSTRAINT "ContactAssociation_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAssociation" ADD CONSTRAINT "ContactAssociation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionResult" ADD CONSTRAINT "ExtractionResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionResult" ADD CONSTRAINT "ExtractionResult_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedField" ADD CONSTRAINT "ExtractedField_extractionResultId_fkey" FOREIGN KEY ("extractionResultId") REFERENCES "ExtractionResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionEvidence" ADD CONSTRAINT "EntityResolutionEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionEvidence" ADD CONSTRAINT "EntityResolutionEvidence_extractedFieldId_fkey" FOREIGN KEY ("extractedFieldId") REFERENCES "ExtractedField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionEvidence" ADD CONSTRAINT "EntityResolutionEvidence_candidatePartyId_fkey" FOREIGN KEY ("candidatePartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionEvidence" ADD CONSTRAINT "EntityResolutionEvidence_candidateBuildingId_fkey" FOREIGN KEY ("candidateBuildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionEvidence" ADD CONSTRAINT "EntityResolutionEvidence_candidateContactId_fkey" FOREIGN KEY ("candidateContactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionDecision" ADD CONSTRAINT "EntityResolutionDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionDecision" ADD CONSTRAINT "EntityResolutionDecision_extractedFieldId_fkey" FOREIGN KEY ("extractedFieldId") REFERENCES "ExtractedField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionDecision" ADD CONSTRAINT "EntityResolutionDecision_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EntityResolutionEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionDecision" ADD CONSTRAINT "EntityResolutionDecision_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "EntityResolutionDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuerPartyId_fkey" FOREIGN KEY ("issuerPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billedToPartyId_fkey" FOREIGN KEY ("billedToPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableLedgerEntry" ADD CONSTRAINT "ReceivableLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableLedgerEntry" ADD CONSTRAINT "ReceivableLedgerEntry_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableLedgerEntry" ADD CONSTRAINT "ReceivableLedgerEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "ReceivableLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCaseReceivable" ADD CONSTRAINT "CollectionCaseReceivable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCaseReceivable" ADD CONSTRAINT "CollectionCaseReceivable_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCaseReceivable" ADD CONSTRAINT "CollectionCaseReceivable_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEvent" ADD CONSTRAINT "CollectionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionEvent" ADD CONSTRAINT "CollectionEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReviewFlag" ADD CONSTRAINT "LegalReviewFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReviewFlag" ADD CONSTRAINT "LegalReviewFlag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalReviewFlag" ADD CONSTRAINT "LegalReviewFlag_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
