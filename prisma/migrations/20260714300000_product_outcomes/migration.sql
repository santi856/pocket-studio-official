-- CreateTable
CREATE TABLE "product_outcome_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "knowledgeNodeId" TEXT,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_outcome_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_outcome_records_projectId_metricKey_recordedAt_idx" ON "product_outcome_records"("projectId", "metricKey", "recordedAt");

-- AddForeignKey
ALTER TABLE "product_outcome_records" ADD CONSTRAINT "product_outcome_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_outcome_records" ADD CONSTRAINT "product_outcome_records_knowledgeNodeId_fkey" FOREIGN KEY ("knowledgeNodeId") REFERENCES "product_knowledge_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
