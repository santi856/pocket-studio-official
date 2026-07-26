-- CreateTable
CREATE TABLE "generated_app_sessions" (
    "id" TEXT NOT NULL,
    "generatedAppUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_app_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_app_sessions_tokenHash_key" ON "generated_app_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "generated_app_sessions_generatedAppUserId_idx" ON "generated_app_sessions"("generatedAppUserId");

-- AddForeignKey
ALTER TABLE "generated_app_sessions" ADD CONSTRAINT "generated_app_sessions_generatedAppUserId_fkey" FOREIGN KEY ("generatedAppUserId") REFERENCES "generated_app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
