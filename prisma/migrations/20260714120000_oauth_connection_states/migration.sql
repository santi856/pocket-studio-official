-- CreateTable
CREATE TABLE "oauth_connection_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "integrationRequirementId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_connection_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_connection_states_state_key" ON "oauth_connection_states"("state");

-- CreateIndex
CREATE INDEX "oauth_connection_states_projectId_idx" ON "oauth_connection_states"("projectId");

-- AddForeignKey
ALTER TABLE "oauth_connection_states" ADD CONSTRAINT "oauth_connection_states_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
