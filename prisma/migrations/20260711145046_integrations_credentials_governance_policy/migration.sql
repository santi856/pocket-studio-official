-- CreateEnum
CREATE TYPE "IntegrationRequirementLevel" AS ENUM ('REQUIRED', 'OPTIONAL', 'NOT_NEEDED');

-- CreateEnum
CREATE TYPE "IntegrationOwner" AS ENUM ('POCKET_STUDIO', 'CUSTOMER', 'POCKET_STUDIO_MANAGED');

-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('NOT_NEEDED', 'RECOMMENDED', 'REQUIRED', 'SETUP_NEEDED', 'CONNECTED', 'DISCONNECTED', 'MISSING', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PolicyDocumentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'ACCEPTABLE_USE_POLICY', 'COOKIE_NOTICE', 'AI_DISCLOSURE', 'SUBSCRIPTION_TERMS', 'CANCELLATION_REFUND_POLICY', 'DATA_RETENTION_DELETION_POLICY', 'SUPPORT_POLICY', 'ACCESSIBILITY_STATEMENT', 'COMMUNICATIONS_CONSENT', 'MOBILE_PERMISSION_EXPLANATION', 'MARKETPLACE_TERMS');

-- CreateEnum
CREATE TYPE "PolicyDocumentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "integration_requirements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requirementLevel" "IntegrationRequirementLevel" NOT NULL,
    "providerOptions" JSONB,
    "selectedProvider" TEXT,
    "owner" "IntegrationOwner" NOT NULL,
    "connectionStatus" "IntegrationConnectionStatus" NOT NULL,
    "setupRequirements" TEXT,
    "costNotes" TEXT,
    "securityNotes" TEXT,
    "privacyNotes" TEXT,
    "launchImpact" TEXT,
    "fallbackBehavior" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_references" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "integrationRequirementId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_profiles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "businessLocations" JSONB,
    "userLocations" JSONB,
    "productCategory" TEXT,
    "userAgeRange" TEXT,
    "dataCategories" JSONB,
    "monetizationModel" TEXT,
    "distributionChannels" JSONB,
    "relevantGovernanceDomains" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_documents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "PolicyDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PolicyDocumentStatus" NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "basedOnProductStateVersion" INTEGER,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_requirements_projectId_idx" ON "integration_requirements"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_requirements_projectId_category_key" ON "integration_requirements"("projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "credential_references_integrationRequirementId_key" ON "credential_references"("integrationRequirementId");

-- CreateIndex
CREATE INDEX "credential_references_projectId_idx" ON "credential_references"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "governance_profiles_projectId_key" ON "governance_profiles"("projectId");

-- CreateIndex
CREATE INDEX "policy_documents_projectId_idx" ON "policy_documents"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "policy_documents_projectId_type_language_version_key" ON "policy_documents"("projectId", "type", "language", "version");

-- AddForeignKey
ALTER TABLE "integration_requirements" ADD CONSTRAINT "integration_requirements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_integrationRequirementId_fkey" FOREIGN KEY ("integrationRequirementId") REFERENCES "integration_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_profiles" ADD CONSTRAINT "governance_profiles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
