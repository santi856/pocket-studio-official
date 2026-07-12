-- CreateEnum
CREATE TYPE "BuildPlanStatus" AS ENUM ('READY', 'BLOCKED');

-- AlterEnum
ALTER TYPE "ProductEventType" ADD VALUE 'BUILD_PLAN_VERSION_CREATED';

-- CreateTable
CREATE TABLE "build_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "basedOnBlueprintVersion" INTEGER NOT NULL,
    "planStatus" "BuildPlanStatus" NOT NULL,
    "implementationPhases" JSONB NOT NULL,
    "dependencies" JSONB NOT NULL,
    "screenOrder" JSONB NOT NULL,
    "componentStructure" JSONB NOT NULL,
    "navigationGraph" JSONB NOT NULL,
    "dataDependencies" JSONB NOT NULL,
    "backendAndBusinessLogic" JSONB NOT NULL,
    "administrativeRequirements" JSONB NOT NULL,
    "integrations" JSONB NOT NULL,
    "monetization" JSONB NOT NULL,
    "platformRequirements" JSONB NOT NULL,
    "persistence" JSONB NOT NULL,
    "tests" JSONB NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL,
    "evidenceRequirements" JSONB NOT NULL,
    "risk" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "generationMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "build_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "build_plans_projectId_idx" ON "build_plans"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "build_plans_projectId_version_key" ON "build_plans"("projectId", "version");

-- AddForeignKey
ALTER TABLE "build_plans" ADD CONSTRAINT "build_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
