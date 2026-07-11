-- CreateEnum
CREATE TYPE "DecisionDisclosureTier" AS ENUM ('ROUTINE', 'IMPORTANT', 'CONSEQUENTIAL');

-- CreateEnum
CREATE TYPE "DecisionApprovalStatus" AS ENUM ('AUTO_APPLIED', 'RECOMMENDED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendation" TEXT,
    "alternatives" JSONB,
    "reason" TEXT,
    "impact" JSONB,
    "risk" TEXT,
    "disclosureTier" "DecisionDisclosureTier" NOT NULL,
    "approvalStatus" "DecisionApprovalStatus" NOT NULL,
    "customerResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" TEXT,
    "effectiveVersion" TEXT,
    "evidenceRef" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decisions_projectId_idx" ON "decisions"("projectId");

-- CreateIndex
CREATE INDEX "decisions_projectId_approvalStatus_idx" ON "decisions"("projectId", "approvalStatus");

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
