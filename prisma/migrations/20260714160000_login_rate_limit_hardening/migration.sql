-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- AlterTable: add as NOT NULL with a temporary default so any existing
-- rows backfill safely, then drop the default so every future insert must
-- supply a real value explicitly (Prisma schema itself has no @default
-- here) -- a purely additive, non-destructive change (P3-02 regression
-- repair, D-0053).
ALTER TABLE "login_attempts" ADD COLUMN     "ipAddress" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "login_attempts" ALTER COLUMN "ipAddress" DROP DEFAULT;

-- DropIndex
DROP INDEX "login_attempts_email_createdAt_idx";

-- CreateIndex
CREATE INDEX "login_attempts_email_ipAddress_createdAt_idx" ON "login_attempts"("email", "ipAddress", "createdAt");
