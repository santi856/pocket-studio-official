-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHING', 'LIVE', 'PUBLISH_FAILED', 'UNPUBLISHED', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogAction" ADD VALUE 'PROJECT_PUBLISHED';
ALTER TYPE "AuditLogAction" ADD VALUE 'PROJECT_PUBLISH_FAILED';
ALTER TYPE "AuditLogAction" ADD VALUE 'PROJECT_UNPUBLISHED';
ALTER TYPE "AuditLogAction" ADD VALUE 'PROJECT_PUBLICATION_SUSPENDED';
ALTER TYPE "AuditLogAction" ADD VALUE 'PROJECT_PUBLICATION_RESTORED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductEventType" ADD VALUE 'PROJECT_PUBLISHED';
ALTER TYPE "ProductEventType" ADD VALUE 'PROJECT_PUBLISH_FAILED';
ALTER TYPE "ProductEventType" ADD VALUE 'PROJECT_UNPUBLISHED';
ALTER TYPE "ProductEventType" ADD VALUE 'PROJECT_PUBLICATION_SUSPENDED';
ALTER TYPE "ProductEventType" ADD VALUE 'PROJECT_PUBLICATION_RESTORED';

-- CreateTable
CREATE TABLE "project_publications" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedBlueprintVersion" INTEGER,
    "publishedBuildPlanVersion" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "lastKnownGoodBlueprintVersion" INTEGER,
    "lastKnownGoodBuildPlanVersion" INTEGER,
    "suspensionReason" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_publications_projectId_key" ON "project_publications"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_publications_publicSlug_key" ON "project_publications"("publicSlug");

-- CreateIndex
CREATE INDEX "project_publications_publicSlug_idx" ON "project_publications"("publicSlug");

-- AddForeignKey
ALTER TABLE "project_publications" ADD CONSTRAINT "project_publications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
