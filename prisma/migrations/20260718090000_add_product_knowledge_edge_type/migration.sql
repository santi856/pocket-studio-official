-- CreateEnum
CREATE TYPE "ProductKnowledgeEdgeType" AS ENUM ('CONTAINS', 'TRIGGERS', 'DEPENDS_ON');

-- AlterTable: product_knowledge_edges has never had a real row written to it
-- outside its own tests (confirmed empty in both pocket_studio_dev and
-- pocket_studio_test before this migration, Stage 3 D-0081) -- edgeType is
-- added NOT NULL with no default, since there is no existing data to
-- violate the constraint.
ALTER TABLE "product_knowledge_edges" ADD COLUMN     "edgeType" "ProductKnowledgeEdgeType" NOT NULL;
ALTER TABLE "product_knowledge_edges" ADD COLUMN     "provenance" JSONB;

-- DropIndex
DROP INDEX "product_knowledge_edges_sourceNodeId_targetNodeId_key";

-- CreateIndex
CREATE UNIQUE INDEX "product_knowledge_edges_sourceNodeId_targetNodeId_edgeType_key" ON "product_knowledge_edges"("sourceNodeId", "targetNodeId", "edgeType");
