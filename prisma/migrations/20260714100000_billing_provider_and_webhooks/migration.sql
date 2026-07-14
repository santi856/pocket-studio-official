-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "billingProviderCustomerId" TEXT,
ADD COLUMN     "billingProviderSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_billingProviderCustomerId_key" ON "organization_subscriptions"("billingProviderCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_billingProviderSubscriptionId_key" ON "organization_subscriptions"("billingProviderSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_provider_providerEventId_key" ON "processed_webhook_events"("provider", "providerEventId");
