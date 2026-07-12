-- CreateEnum
CREATE TYPE "ChangeSetStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductEventType" ADD VALUE 'CHANGE_SET_APPLIED';
ALTER TYPE "ProductEventType" ADD VALUE 'CHANGE_SET_REJECTED';

-- CreateTable
CREATE TABLE "change_sets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "priorIdea" TEXT NOT NULL,
    "combinedIdea" TEXT NOT NULL,
    "impactCategories" JSONB NOT NULL,
    "addedCategories" JSONB NOT NULL,
    "requiresRegeneration" BOOLEAN NOT NULL,
    "status" "ChangeSetStatus" NOT NULL,
    "resultSummary" TEXT,
    "resultingBlueprintVersion" INTEGER,
    "resultingBuildPlanVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "change_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "change_sets_decisionId_key" ON "change_sets"("decisionId");

-- CreateIndex
CREATE INDEX "change_sets_projectId_idx" ON "change_sets"("projectId");

-- AddForeignKey
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
