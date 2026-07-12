-- CreateTable
CREATE TABLE "generated_app_users" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "ownerGeneratedAppUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_app_users_projectId_idx" ON "generated_app_users"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_app_users_projectId_email_key" ON "generated_app_users"("projectId", "email");

-- CreateIndex
CREATE INDEX "generated_records_projectId_idx" ON "generated_records"("projectId");

-- CreateIndex
CREATE INDEX "generated_records_projectId_modelKey_idx" ON "generated_records"("projectId", "modelKey");

-- AddForeignKey
ALTER TABLE "generated_app_users" ADD CONSTRAINT "generated_app_users_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_records" ADD CONSTRAINT "generated_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_records" ADD CONSTRAINT "generated_records_ownerGeneratedAppUserId_fkey" FOREIGN KEY ("ownerGeneratedAppUserId") REFERENCES "generated_app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
