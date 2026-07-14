-- CreateEnum
CREATE TYPE "GeneratedAppPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "generated_app_payments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "integrationRequirementId" TEXT NOT NULL,
    "generatedAppUserId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "description" TEXT NOT NULL,
    "status" "GeneratedAppPaymentStatus" NOT NULL,
    "providerChargeId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_app_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_app_payments_projectId_idx" ON "generated_app_payments"("projectId");

-- AddForeignKey
ALTER TABLE "generated_app_payments" ADD CONSTRAINT "generated_app_payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_app_payments" ADD CONSTRAINT "generated_app_payments_integrationRequirementId_fkey" FOREIGN KEY ("integrationRequirementId") REFERENCES "integration_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_app_payments" ADD CONSTRAINT "generated_app_payments_generatedAppUserId_fkey" FOREIGN KEY ("generatedAppUserId") REFERENCES "generated_app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
