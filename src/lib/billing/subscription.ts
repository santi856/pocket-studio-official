import "server-only";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import { getLatestPlan } from "@/lib/billing/plans";
import { nextBillingState } from "@/lib/billing/access";
import type { BillingLifecycleEvent } from "@/lib/billing/access";
import type { OrganizationSubscription, PlanKey } from "@/generated/prisma/client";

export class SubscriptionAlreadyExistsError extends Error {
  constructor() {
    super("This organization already has a subscription.");
    this.name = "SubscriptionAlreadyExistsError";
  }
}

export class SubscriptionNotFoundError extends Error {
  constructor() {
    super("This organization has no subscription.");
    this.name = "SubscriptionNotFoundError";
  }
}

export class PlanNotFoundError extends Error {
  constructor(planKey: string) {
    super(`No registry entry exists for plan "${planKey}".`);
    this.name = "PlanNotFoundError";
  }
}

/**
 * Every organization starts on Free/Explore, TRIALING (Master Spec §36) —
 * no organization can lack a subscription record, so entitlement checks
 * never have to special-case "no subscription."
 */
export async function createSubscription(
  actorUserId: string,
  organizationId: string,
): Promise<OrganizationSubscription> {
  await requireOrganizationMembership(actorUserId, organizationId, "OWNER");

  const existing = await db.organizationSubscription.findUnique({ where: { organizationId } });
  if (existing) {
    throw new SubscriptionAlreadyExistsError();
  }

  return db.$transaction(async (tx) => {
    const subscription = await tx.organizationSubscription.create({
      data: { organizationId, planKey: "FREE_EXPLORE", billingState: "TRIALING" },
    });

    await tx.billingEvent.create({
      data: {
        organizationSubscriptionId: subscription.id,
        type: "SUBSCRIPTION_CREATED",
        toState: subscription.billingState,
        summary: "Subscription created on Free / Explore, trialing.",
      },
    });

    return subscription;
  });
}

const EVENT_TO_BILLING_EVENT_TYPE: Record<
  BillingLifecycleEvent,
  | "PAYMENT_FAILED"
  | "PAYMENT_RETRY_SCHEDULED"
  | "RESTRICTED"
  | "SUSPENDED"
  | "PAYMENT_RECOVERED"
  | "CANCELED"
  | "STATE_TRANSITIONED"
> = {
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_RETRY_EXHAUSTED: "PAYMENT_RETRY_SCHEDULED",
  GRACE_PERIOD_EXPIRED: "RESTRICTED",
  RESTRICTION_ESCALATED: "SUSPENDED",
  PAYMENT_RECOVERED: "PAYMENT_RECOVERED",
  CANCEL_REQUESTED: "CANCELED",
  RETENTION_PERIOD_EXPIRED: "STATE_TRANSITIONED",
  DELETION_EXECUTED: "STATE_TRANSITIONED",
};

/**
 * The only way billingState changes — always through the deterministic
 * state machine (src/lib/billing/access.ts), never a direct field write,
 * and always with a BillingEvent recording what happened and why (Master
 * Spec §37: "billing provider state is authoritative").
 */
export async function transitionBillingState(
  actorUserId: string,
  organizationId: string,
  event: BillingLifecycleEvent,
): Promise<OrganizationSubscription> {
  await requireOrganizationMembership(actorUserId, organizationId, "OWNER");

  return db.$transaction(async (tx) => {
    const subscription = await tx.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!subscription) {
      throw new SubscriptionNotFoundError();
    }

    const toState = nextBillingState(subscription.billingState, event);

    const updated = await tx.organizationSubscription.update({
      where: { organizationId },
      data: { billingState: toState },
    });

    await tx.billingEvent.create({
      data: {
        organizationSubscriptionId: subscription.id,
        type: EVENT_TO_BILLING_EVENT_TYPE[event],
        fromState: subscription.billingState,
        toState,
        summary: `Billing state transitioned from ${subscription.billingState} to ${toState} (${event}).`,
      },
    });

    return updated;
  });
}

export async function getSubscription(
  actorUserId: string,
  organizationId: string,
): Promise<OrganizationSubscription | null> {
  await requireOrganizationMembership(actorUserId, organizationId, "MEMBER");

  return db.organizationSubscription.findUnique({ where: { organizationId } });
}

export type Entitlements = Record<string, unknown>;

/**
 * Resolves an organization's current plan entitlements from the Plan
 * Registry (same lookup pattern as capability feasibility) — entitlements
 * are never hardcoded per caller, always looked up from the plan the
 * organization is actually subscribed to.
 */
export async function getEntitlements(
  actorUserId: string,
  organizationId: string,
): Promise<{ planKey: PlanKey; entitlements: Entitlements }> {
  await requireOrganizationMembership(actorUserId, organizationId, "MEMBER");

  const subscription = await db.organizationSubscription.findUnique({ where: { organizationId } });
  if (!subscription) {
    throw new SubscriptionNotFoundError();
  }

  const plan = await getLatestPlan(subscription.planKey);
  if (!plan) {
    throw new PlanNotFoundError(subscription.planKey);
  }

  return { planKey: subscription.planKey, entitlements: plan.entitlements as Entitlements };
}
