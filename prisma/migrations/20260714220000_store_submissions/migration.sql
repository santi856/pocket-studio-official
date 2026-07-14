-- AlterEnum
ALTER TYPE "ProductEvidenceType" ADD VALUE 'STORE_SUBMISSION_ATTEMPT';

-- CreateEnum
CREATE TYPE "StoreSubmissionPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "StoreSubmissionTrack" AS ENUM ('INTERNAL_TESTING', 'BETA', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "StoreSubmissionStatus" AS ENUM ('IN_REVIEW', 'APPROVED', 'REJECTED', 'RELEASED');

-- CreateTable
CREATE TABLE "store_submissions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" "StoreSubmissionPlatform" NOT NULL,
    "track" "StoreSubmissionTrack" NOT NULL,
    "version" TEXT NOT NULL,
    "buildNumber" INTEGER NOT NULL,
    "status" "StoreSubmissionStatus" NOT NULL,
    "basedOnBlueprintVersion" INTEGER NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_submissions_projectId_platform_createdAt_idx" ON "store_submissions"("projectId", "platform", "createdAt");

-- AddForeignKey
ALTER TABLE "store_submissions" ADD CONSTRAINT "store_submissions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
