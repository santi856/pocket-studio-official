import "server-only";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import { getBillingProvider } from "./get-billing-provider";
import { SubscriptionNotFoundError } from "./subscription";
import type { BillingState } from "@/generated/prisma/client";

// The provider's own real-time status values this codebase can confirm
// are consistent with each locally recorded BillingState. Deliberately
// narrow (only the states nextBillingState's own transitions produce) —
// an unrecognized provider status is treated as drift, not silently
// matched against everything.
const CONSISTENT_LOCAL_STATES: Readonly<Record<string, readonly BillingState[]>> = {
  trialing: ["TRIALING"],
  active: ["ACTIVE"],
  past_due: ["PAST_DUE", "PAYMENT_RETRYING", "GRACE_PERIOD"],
  canceled: ["CANCELED", "RETENTION_PERIOD", "DELETION_SCHEDULED", "DELETED"],
  unpaid: ["RESTRICTED", "SUSPENDED"],
};

export type ReconciliationResult =
  | { status: "not_linked" }
  | { status: "in_sync"; providerStatus: string; localState: BillingState }
  | { status: "drift_detected"; providerStatus: string; localState: BillingState };

/**
 * Compares the locally recorded billingState against the billing
 * provider's own real-time status — catches drift from a webhook that was
 * never delivered or failed to process (Master Spec §37: "billing
 * provider state is authoritative"). Deliberately detects and records
 * drift rather than auto-correcting it: the state machine
 * (src/lib/billing/access.ts) advances through event-driven transitions
 * (grace periods, retries, notifications), and forcing a local state to
 * jump directly to match a provider snapshot could skip a real step a
 * customer is entitled to (e.g. a grace period) — a human or a future,
 * more targeted auto-remediation unit should decide the correct catch-up
 * event, not this function guessing one.
 */
export async function reconcileSubscriptionWithProvider(
  actorUserId: string,
  organizationId: string,
): Promise<ReconciliationResult> {
  await requireOrganizationMembership(actorUserId, organizationId, "OWNER");

  const subscription = await db.organizationSubscription.findUnique({ where: { organizationId } });
  if (!subscription) {
    throw new SubscriptionNotFoundError();
  }
  if (!subscription.billingProviderSubscriptionId) {
    return { status: "not_linked" };
  }

  const provider = getBillingProvider();
  const { status: providerStatus } = await provider.getSubscriptionStatus(
    subscription.billingProviderSubscriptionId,
  );

  const consistentStates = CONSISTENT_LOCAL_STATES[providerStatus] ?? [];
  const isInSync = consistentStates.includes(subscription.billingState);

  if (isInSync) {
    return { status: "in_sync", providerStatus, localState: subscription.billingState };
  }

  await db.billingEvent.create({
    data: {
      organizationSubscriptionId: subscription.id,
      type: "STATE_TRANSITIONED",
      summary:
        `Reconciliation detected drift: the billing provider reports "${providerStatus}" but ` +
        `the local record is "${subscription.billingState}". Not auto-corrected — a real event ` +
        `(webhook or manual review) is required to determine the correct transition.`,
      data: { providerStatus, localState: subscription.billingState },
    },
  });

  return { status: "drift_detected", providerStatus, localState: subscription.billingState };
}
