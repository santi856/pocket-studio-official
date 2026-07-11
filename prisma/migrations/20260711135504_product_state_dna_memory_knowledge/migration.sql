-- CreateEnum
CREATE TYPE "ProductMemoryEntryType" AS ENUM ('FACT', 'REQUIREMENT', 'RECOMMENDATION', 'DECISION', 'REJECTED_OPTION', 'CONSTRAINT', 'PREFERENCE', 'HISTORY', 'LIMITATION', 'OPEN_QUESTION', 'CONTEXT');

-- CreateEnum
CREATE TYPE "ProductKnowledgeNodeType" AS ENUM ('REQUIREMENT', 'WORKFLOW', 'SCREEN', 'ACTION', 'DATA_MODEL', 'PERMISSION', 'INTEGRATION', 'IMPLEMENTATION', 'TEST', 'EVIDENCE');

-- CreateTable
CREATE TABLE "product_states" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "originalIdea" TEXT NOT NULL,
    "productIntelligence" JSONB,
    "feasibilityReport" JSONB,
    "businessModelBrief" JSONB,
    "monetizationRecommendations" JSONB,
    "unitEconomicsAssumptions" JSONB,
    "operationalComplexity" JSONB,
    "requiredIntegrations" JSONB,
    "outputTargets" JSONB,
    "governanceRequirements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "product_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_dna_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "originalIdea" TEXT NOT NULL,
    "purpose" TEXT,
    "problem" TEXT,
    "targetUsers" JSONB,
    "productThesis" TEXT,
    "differentiation" TEXT,
    "productEdge" TEXT,
    "customerPromise" TEXT,
    "brandDirection" JSONB,
    "businessModel" TEXT,
    "monetizationDirection" TEXT,
    "constraints" JSONB,
    "nonNegotiables" JSONB,
    "acceptedDecisions" JSONB,
    "rejectedDecisions" JSONB,
    "openQuestions" JSONB,
    "knownRisks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "product_dna_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_memory_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProductMemoryEntryType" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_memory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_knowledge_nodes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProductKnowledgeNodeType" NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_knowledge_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_knowledge_edges" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_knowledge_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_states_projectId_idx" ON "product_states"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "product_states_projectId_version_key" ON "product_states"("projectId", "version");

-- CreateIndex
CREATE INDEX "product_dna_versions_projectId_idx" ON "product_dna_versions"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "product_dna_versions_projectId_version_key" ON "product_dna_versions"("projectId", "version");

-- CreateIndex
CREATE INDEX "product_memory_entries_projectId_idx" ON "product_memory_entries"("projectId");

-- CreateIndex
CREATE INDEX "product_memory_entries_projectId_type_idx" ON "product_memory_entries"("projectId", "type");

-- CreateIndex
CREATE INDEX "product_knowledge_nodes_projectId_idx" ON "product_knowledge_nodes"("projectId");

-- CreateIndex
CREATE INDEX "product_knowledge_nodes_projectId_type_idx" ON "product_knowledge_nodes"("projectId", "type");

-- CreateIndex
CREATE INDEX "product_knowledge_edges_projectId_idx" ON "product_knowledge_edges"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "product_knowledge_edges_sourceNodeId_targetNodeId_key" ON "product_knowledge_edges"("sourceNodeId", "targetNodeId");

-- AddForeignKey
ALTER TABLE "product_states" ADD CONSTRAINT "product_states_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_dna_versions" ADD CONSTRAINT "product_dna_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_memory_entries" ADD CONSTRAINT "product_memory_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_knowledge_nodes" ADD CONSTRAINT "product_knowledge_nodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_knowledge_edges" ADD CONSTRAINT "product_knowledge_edges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_knowledge_edges" ADD CONSTRAINT "product_knowledge_edges_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "product_knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_knowledge_edges" ADD CONSTRAINT "product_knowledge_edges_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "product_knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
