-- CreateEnum
CREATE TYPE "ProductEventType" AS ENUM ('PRODUCT_STATE_VERSION_CREATED', 'PRODUCT_DNA_VERSION_CREATED', 'DECISION_RECORDED', 'DECISION_RESPONDED', 'TRUTH_STATUS_UPDATED');

-- CreateEnum
CREATE TYPE "ProductEvidenceType" AS ENUM ('FEASIBILITY_ASSESSMENT', 'REQUIREMENT_DERIVATION', 'STRUCTURED_MANUAL_VERIFICATION');

-- CreateEnum
CREATE TYPE "TruthStatusValue" AS ENUM ('IMPLEMENTED', 'PLANNED', 'MISSING', 'BLOCKED', 'UNSUPPORTED', 'NOT_EVALUATED');

-- CreateTable
CREATE TABLE "product_events" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProductEventType" NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_evidence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "evidenceType" "ProductEvidenceType" NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "limitations" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truth_status_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "subjectLabel" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TruthStatusValue" NOT NULL,
    "evidenceRef" TEXT,
    "rationale" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "truth_status_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_events_projectId_idx" ON "product_events"("projectId");

-- CreateIndex
CREATE INDEX "product_events_projectId_type_idx" ON "product_events"("projectId", "type");

-- CreateIndex
CREATE INDEX "product_evidence_projectId_idx" ON "product_evidence"("projectId");

-- CreateIndex
CREATE INDEX "product_evidence_projectId_subjectKey_idx" ON "product_evidence"("projectId", "subjectKey");

-- CreateIndex
CREATE INDEX "truth_status_entries_projectId_idx" ON "truth_status_entries"("projectId");

-- CreateIndex
CREATE INDEX "truth_status_entries_projectId_subjectKey_idx" ON "truth_status_entries"("projectId", "subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "truth_status_entries_projectId_subjectKey_version_key" ON "truth_status_entries"("projectId", "subjectKey", "version");

-- AddForeignKey
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_evidence" ADD CONSTRAINT "product_evidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truth_status_entries" ADD CONSTRAINT "truth_status_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
