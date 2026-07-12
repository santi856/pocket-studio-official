-- CreateEnum
CREATE TYPE "PlanKey" AS ENUM ('FREE_EXPLORE', 'BUILDER', 'LAUNCH', 'MANAGED', 'AGENCY');

-- CreateEnum
CREATE TYPE "BillingState" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAYMENT_RETRYING', 'GRACE_PERIOD', 'RESTRICTED', 'SUSPENDED', 'CANCELED', 'EXPIRED', 'RETENTION_PERIOD', 'DELETION_SCHEDULED', 'DELETED');

-- CreateEnum
CREATE TYPE "BillingEventType" AS ENUM ('SUBSCRIPTION_CREATED', 'STATE_TRANSITIONED', 'PAYMENT_FAILED', 'PAYMENT_RETRY_SCHEDULED', 'PAYMENT_RECOVERED', 'RESTRICTED', 'SUSPENDED', 'RESTORED', 'CANCELED');

-- CreateTable
CREATE TABLE "plan_definitions" (
    "id" TEXT NOT NULL,
    "planKey" "PlanKey" NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPriceCents" INTEGER,
    "annualPriceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "entitlements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "plan_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planKey" "PlanKey" NOT NULL DEFAULT 'FREE_EXPLORE',
    "billingState" "BillingState" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "organizationSubscriptionId" TEXT NOT NULL,
    "type" "BillingEventType" NOT NULL,
    "fromState" "BillingState",
    "toState" "BillingState",
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_definitions_planKey_idx" ON "plan_definitions"("planKey");

-- CreateIndex
CREATE UNIQUE INDEX "plan_definitions_planKey_version_key" ON "plan_definitions"("planKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_organizationId_key" ON "organization_subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "billing_events_organizationSubscriptionId_idx" ON "billing_events"("organizationSubscriptionId");

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organizationSubscriptionId_fkey" FOREIGN KEY ("organizationSubscriptionId") REFERENCES "organization_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
