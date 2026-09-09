-- CreateEnum
CREATE TYPE "IngestionDocumentFormat" AS ENUM ('PDF_NATIVE', 'PDF_SCANNED', 'CSV', 'XLSX', 'UNSUPPORTED', 'MALFORMED');

-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('RECEIVED', 'PARSED', 'REVIEW_REQUIRED', 'UNSUPPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportCandidateStatus" AS ENUM ('PARSED', 'REVIEW_REQUIRED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DuplicateKind" AS ENUM ('EXACT_DOCUMENT_DUPLICATE', 'POSSIBLE_BUSINESS_DUPLICATE');

-- AlterTable
ALTER TABLE "SourceDocument" ADD COLUMN     "detectedFormat" "IngestionDocumentFormat",
ADD COLUMN     "processingErrorCode" TEXT,
ADD COLUMN     "processingStatus" "DocumentProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "reviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ImportBatchSummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "documentsReceived" INTEGER NOT NULL,
    "documentsParsed" INTEGER NOT NULL,
    "invoiceCandidates" INTEGER NOT NULL,
    "reviewRequired" INTEGER NOT NULL,
    "duplicates" INTEGER NOT NULL,
    "unsupportedDocuments" INTEGER NOT NULL,
    "failures" INTEGER NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatchSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceImportCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "extractionResultId" TEXT NOT NULL,
    "candidateIndex" INTEGER NOT NULL,
    "status" "ImportCandidateStatus" NOT NULL,
    "reviewReasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedInvoiceId" TEXT,

    CONSTRAINT "InvoiceImportCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "matchesDocumentId" TEXT NOT NULL,
    "kind" "DuplicateKind" NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatchSummary_importBatchId_key" ON "ImportBatchSummary"("importBatchId");

-- CreateIndex
CREATE INDEX "ImportBatchSummary_organizationId_finalizedAt_idx" ON "ImportBatchSummary"("organizationId", "finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceImportCandidate_acceptedInvoiceId_key" ON "InvoiceImportCandidate"("acceptedInvoiceId");

-- CreateIndex
CREATE INDEX "InvoiceImportCandidate_organizationId_status_createdAt_idx" ON "InvoiceImportCandidate"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceImportCandidate_organizationId_sourceDocumentId_extr_key" ON "InvoiceImportCandidate"("organizationId", "sourceDocumentId", "extractionResultId", "candidateIndex");

-- CreateIndex
CREATE INDEX "DuplicateFinding_organizationId_importBatchId_kind_idx" ON "DuplicateFinding"("organizationId", "importBatchId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateFinding_organizationId_sourceDocumentId_matchesDoc_key" ON "DuplicateFinding"("organizationId", "sourceDocumentId", "matchesDocumentId", "kind");

-- AddForeignKey
ALTER TABLE "ImportBatchSummary" ADD CONSTRAINT "ImportBatchSummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchSummary" ADD CONSTRAINT "ImportBatchSummary_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceImportCandidate" ADD CONSTRAINT "InvoiceImportCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceImportCandidate" ADD CONSTRAINT "InvoiceImportCandidate_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceImportCandidate" ADD CONSTRAINT "InvoiceImportCandidate_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceImportCandidate" ADD CONSTRAINT "InvoiceImportCandidate_extractionResultId_fkey" FOREIGN KEY ("extractionResultId") REFERENCES "ExtractionResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceImportCandidate" ADD CONSTRAINT "InvoiceImportCandidate_acceptedInvoiceId_fkey" FOREIGN KEY ("acceptedInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateFinding" ADD CONSTRAINT "DuplicateFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateFinding" ADD CONSTRAINT "DuplicateFinding_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateFinding" ADD CONSTRAINT "DuplicateFinding_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateFinding" ADD CONSTRAINT "DuplicateFinding_matchesDocumentId_fkey" FOREIGN KEY ("matchesDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
