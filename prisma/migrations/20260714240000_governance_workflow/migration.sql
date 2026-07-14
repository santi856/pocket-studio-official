-- AlterTable: PolicyDocument gains real review/approval/publish/translation tracking
ALTER TABLE "policy_documents"
  ADD COLUMN "professionallyReviewed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewerName" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "translatedFromVersion" INTEGER;

-- CreateTable
CREATE TABLE "policy_acceptances" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "policyDocumentId" TEXT NOT NULL,
    "generatedAppUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policy_acceptances_policyDocumentId_generatedAppUserId_key" ON "policy_acceptances"("policyDocumentId", "generatedAppUserId");

-- CreateIndex
CREATE INDEX "policy_acceptances_projectId_idx" ON "policy_acceptances"("projectId");

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_policyDocumentId_fkey" FOREIGN KEY ("policyDocumentId") REFERENCES "policy_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_generatedAppUserId_fkey" FOREIGN KEY ("generatedAppUserId") REFERENCES "generated_app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "GovernanceInterpretationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED_NO_IMPACT', 'VERIFIED_MATERIAL', 'PROFESSIONAL_REVIEW_PENDING', 'PROFESSIONAL_REVIEW_COMPLETE');

-- CreateTable
CREATE TABLE "governance_requirements" (
    "id" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "officialSource" TEXT NOT NULL,
    "applicability" TEXT NOT NULL,
    "affectedCapabilities" JSONB NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "enforcementDate" TIMESTAMP(3),
    "verificationDate" TIMESTAMP(3) NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "interpretationStatus" "GovernanceInterpretationStatus" NOT NULL,
    "professionalReviewRequired" BOOLEAN NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "governance_requirements_requirementKey_version_key" ON "governance_requirements"("requirementKey", "version");

-- CreateIndex
CREATE INDEX "governance_requirements_requirementKey_idx" ON "governance_requirements"("requirementKey");

-- CreateEnum
CREATE TYPE "GovernanceImpactMateriality" AS ENUM ('NOT_MATERIAL', 'MATERIAL');

-- CreateEnum
CREATE TYPE "GovernanceImpactStatus" AS ENUM ('IDENTIFIED', 'NOTIFIED', 'APPROVED', 'IMPLEMENTED', 'VALIDATED', 'DISMISSED');

-- CreateTable
CREATE TABLE "governance_impact_assessments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "governanceRequirementId" TEXT NOT NULL,
    "materiality" "GovernanceImpactMateriality" NOT NULL,
    "status" "GovernanceImpactStatus" NOT NULL,
    "remediationProposal" TEXT,
    "dismissedReason" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "implementedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_impact_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_impact_assessments_projectId_idx" ON "governance_impact_assessments"("projectId");

-- CreateIndex
CREATE INDEX "governance_impact_assessments_governanceRequirementId_idx" ON "governance_impact_assessments"("governanceRequirementId");

-- AddForeignKey
ALTER TABLE "governance_impact_assessments" ADD CONSTRAINT "governance_impact_assessments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_impact_assessments" ADD CONSTRAINT "governance_impact_assessments_governanceRequirementId_fkey" FOREIGN KEY ("governanceRequirementId") REFERENCES "governance_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
