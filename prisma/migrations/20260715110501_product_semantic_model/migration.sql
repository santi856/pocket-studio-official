-- CreateTable
CREATE TABLE "product_semantic_models" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "purpose" TEXT,
    "targetUsers" JSONB,
    "actors" JSONB,
    "entities" JSONB,
    "workflows" JSONB,
    "capabilities" JSONB,
    "permissions" JSONB,
    "businessRules" JSONB,
    "monetization" JSONB,
    "integrations" JSONB,
    "constraints" JSONB,
    "unresolvedQuestions" JSONB,
    "consequentialDecisions" JSONB,
    "unsupportedRequirements" JSONB,
    "generationMetadata" JSONB NOT NULL,
    "coverageResult" JSONB,
    "basedOnProductStateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "product_semantic_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_semantic_models_projectId_idx" ON "product_semantic_models"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "product_semantic_models_projectId_version_key" ON "product_semantic_models"("projectId", "version");

-- AddForeignKey
ALTER TABLE "product_semantic_models" ADD CONSTRAINT "product_semantic_models_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
