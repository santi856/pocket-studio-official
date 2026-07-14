import "server-only";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import { getLatestPlan } from "@/lib/billing/plans";
import { nextBillingState } from "@/lib/billing/access";
import { recordAuditLogEntry } from "@/lib/observability/audit-log";
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
 * The only place billingState changes — always through the deterministic
 * state machine (src/lib/billing/access.ts), never a direct field write,
 * and always with a BillingEvent recording what happened and why (Master
 * Spec §37: "billing provider state is authoritative"). Shared by both the
 * member-driven path (transitionBillingState) and the webhook-driven path
 * (applyBillingLifecycleEventFromWebhook) — the two differ only in who is
 * authorized to trigger it, never in how the transition itself is applied
 * or recorded.
 */
async function applyBillingStateTransition(
  organizationId: string,
  event: BillingLifecycleEvent,
): Promise<OrganizationSubscription> {
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

export async function transitionBillingState(
  actorUserId: string,
  organizationId: string,
  event: BillingLifecycleEvent,
): Promise<OrganizationSubscription> {
  await requireOrganizationMembership(actorUserId, organizationId, "OWNER");
  const updated = await applyBillingStateTransition(organizationId, event);

  // BillingEvent (above) already records fromState/toState/summary but
  // has no actorUserId field — this is the only place that captures
  // *which member* triggered a member-driven transition (the
  // webhook-driven path below has no actor to record, by design).
  await recordAuditLogEntry({
    organizationId,
    actorUserId,
    action: "BILLING_STATE_TRANSITIONED",
    targetType: "OrganizationSubscription",
    targetId: updated.id,
    metadata: { event, billingState: updated.billingState },
  });

  return updated;
}

/**
 * The webhook-driven counterpart to transitionBillingState — deliberately
 * has no actorUserId and performs no membership check. A verified webhook
 * event (real signature, checked by the caller before this is ever
 * reached — src/lib/billing/webhook-processing.ts) IS the authorization:
 * there is no Pocket Studio member "acting" here, Stripe itself is
 * reporting what already happened on its side, and requiring a member
 * check would make it impossible for a real, correctly-signed webhook to
 * ever update a subscription automatically. This is the same class of
 * deliberate, disclosed exception as authenticateGeneratedAppUser
 * (src/lib/generation/generated-app-auth.ts, P3-02) — recorded in
 * src/lib/tenancy/verify-tenant-isolation.ts's ALLOWED_EXCEPTIONS.
 */
export async function applyBillingLifecycleEventFromWebhook(
  organizationId: string,
  event: BillingLifecycleEvent,
): Promise<OrganizationSubscription> {
  return applyBillingStateTransition(organizationId, event);
}

/**
 * Links an organization's subscription to its real billing-provider
 * customer/subscription — required before any webhook event can be
 * resolved back to an organization (webhooks identify the customer, not
 * the organization). OWNER-gated like every other subscription mutation;
 * called once a real checkout/setup flow establishes the provider-side
 * customer (that flow itself is out of this unit's scope — disclosed, not
 * silently assumed to exist).
 */
export async function linkBillingProviderCustomer(
  actorUserId: string,
  organizationId: string,
  billingProviderCustomerId: string,
  billingProviderSubscriptionId?: string,
): Promise<OrganizationSubscription> {
  await requireOrganizationMembership(actorUserId, organizationId, "OWNER");

  const subscription = await db.organizationSubscription.findUnique({ where: { organizationId } });
  if (!subscription) {
    throw new SubscriptionNotFoundError();
  }

  return db.organizationSubscription.update({
    where: { organizationId },
    data: {
      billingProviderCustomerId,
      billingProviderSubscriptionId: billingProviderSubscriptionId ?? undefined,
    },
  });
}

/**
 * Resolves which organization a webhook event belongs to. No actor check
 * (same rationale as applyBillingLifecycleEventFromWebhook) — this is a
 * lookup by a foreign, provider-issued id, not an operation scoped by
 * projectId/organizationId that a caller could forge to reach another
 * tenant's data.
 */
export async function findOrganizationIdByBillingProviderCustomerId(
  billingProviderCustomerId: string,
): Promise<string | null> {
  const subscription = await db.organizationSubscription.findUnique({
    where: { billingProviderCustomerId },
    select: { organizationId: true },
  });
  return subscription?.organizationId ?? null;
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
