-- CreateTable
CREATE TABLE "public_route_requests" (
    "id" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_route_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_route_requests_publicSlug_ipAddress_createdAt_idx" ON "public_route_requests"("publicSlug", "ipAddress", "createdAt");
