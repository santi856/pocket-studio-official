-- CreateEnum
CREATE TYPE "CapabilityImplementationLevel" AS ENUM ('SUPPORTED_NOW', 'SUPPORTED_WITH_CONFIGURATION', 'SUPPORTED_WITH_CUSTOMER_INTEGRATION', 'SUPPORTED_LATER_PHASE', 'PROTOTYPE_ONLY', 'PLANNING_ONLY', 'EXTERNAL_APPROVAL_REQUIRED', 'PROFESSIONAL_REVIEW_REQUIRED', 'NOT_CURRENTLY_SUPPORTED', 'UNSAFE_OR_PROHIBITED', 'INSUFFICIENT_INFORMATION');

-- CreateEnum
CREATE TYPE "CapabilityRiskClass" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "capability_registry_entries" (
    "id" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "outputTargets" JSONB,
    "implementationLevel" "CapabilityImplementationLevel" NOT NULL,
    "requiredIntegrations" JSONB,
    "evidenceStandard" TEXT,
    "riskClass" "CapabilityRiskClass" NOT NULL,
    "limitations" JSONB,
    "providerDependencies" JSONB,
    "launchImplications" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "capability_registry_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capability_registry_entries_capabilityKey_idx" ON "capability_registry_entries"("capabilityKey");

-- CreateIndex
CREATE UNIQUE INDEX "capability_registry_entries_capabilityKey_version_key" ON "capability_registry_entries"("capabilityKey", "version");
