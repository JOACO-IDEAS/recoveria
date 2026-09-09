-- CreateEnum
CREATE TYPE "ResolutionDecisionAction" AS ENUM ('CONFIRM_EXISTING', 'REJECT_CANDIDATE', 'CREATE_NEW', 'DEFER');

-- AlterTable
ALTER TABLE "EntityResolutionDecision" ADD COLUMN     "action" "ResolutionDecisionAction" NOT NULL DEFAULT 'DEFER';
