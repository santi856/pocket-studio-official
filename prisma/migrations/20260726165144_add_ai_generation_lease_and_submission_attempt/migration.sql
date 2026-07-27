-- CreateTable
CREATE TABLE "ai_generation_leases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_submission_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_submission_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_generation_leases_organizationId_createdAt_idx" ON "ai_generation_leases"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "idea_submission_attempts_userId_createdAt_idx" ON "idea_submission_attempts"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_generation_leases" ADD CONSTRAINT "ai_generation_leases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
