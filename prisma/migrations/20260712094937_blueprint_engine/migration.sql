-- CreateEnum
CREATE TYPE "BlueprintValidationStatus" AS ENUM ('VALID', 'INVALID');

-- AlterEnum
ALTER TYPE "ProductEventType" ADD VALUE 'BLUEPRINT_VERSION_CREATED';

-- CreateTable
CREATE TABLE "blueprints" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "productType" TEXT,
    "targetUsers" JSONB,
    "roles" JSONB,
    "requirements" JSONB,
    "workflows" JSONB,
    "screens" JSONB,
    "navigation" JSONB,
    "dataModels" JSONB,
    "permissions" JSONB,
    "actions" JSONB,
    "integrations" JSONB,
    "businessRules" JSONB,
    "monetization" JSONB,
    "subscriptions" JSONB,
    "ownerOperations" JSONB,
    "outputTargets" JSONB,
    "themeAndStyle" JSONB,
    "assumptions" JSONB,
    "openDecisions" JSONB,
    "memory" JSONB,
    "security" JSONB,
    "privacy" JSONB,
    "accessibility" JSONB,
    "governance" JSONB,
    "feasibility" JSONB,
    "generationMetadata" JSONB,
    "validationStatus" "BlueprintValidationStatus" NOT NULL,
    "validationErrors" JSONB,
    "basedOnProductStateVersion" INTEGER,
    "basedOnProductDnaVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blueprints_projectId_idx" ON "blueprints"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "blueprints_projectId_version_key" ON "blueprints"("projectId", "version");

-- AddForeignKey
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
