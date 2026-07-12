-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('GENERATION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL,
    "idempotencyKey" TEXT,
    "checkpoint" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_projectId_idx" ON "job_runs"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_projectId_jobType_idempotencyKey_key" ON "job_runs"("projectId", "jobType", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
