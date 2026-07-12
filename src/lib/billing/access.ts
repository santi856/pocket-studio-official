import type { BillingState } from "@/generated/prisma/client";

export type AccessLevel = "full" | "restricted" | "none";

export type RestrictedCapability =
  | "login"
  | "billing_access"
  | "payment_updates"
  | "read_only_projects"
  | "portability_export"
  | "support"
  | "cancellation";

// Master Spec §37: "during restriction preserve, where appropriate: login;
// billing access; payment updates; read-only projects; portability
// export; support; cancellation." There is no fully "none" access tier
// while an organization still exists — only DELETED (the account itself
// is gone) has nothing left to preserve.
const RESTRICTED_CAPABILITIES: readonly RestrictedCapability[] = [
  "login",
  "billing_access",
  "payment_updates",
  "read_only_projects",
  "portability_export",
  "support",
  "cancellation",
];

// TRIALING/ACTIVE/PAST_DUE/PAYMENT_RETRYING/GRACE_PERIOD all keep full
// access — the failed-payment workflow (§37) puts restriction *after*
// grace period is exhausted, not before. Nonpayment must not trigger
// immediate restriction, let alone data deletion.
const ACCESS_BY_STATE: Record<BillingState, AccessLevel> = {
  TRIALING: "full",
  ACTIVE: "full",
  PAST_DUE: "full",
  PAYMENT_RETRYING: "full",
  GRACE_PERIOD: "full",
  RESTRICTED: "restricted",
  SUSPENDED: "restricted",
  CANCELED: "restricted",
  EXPIRED: "restricted",
  RETENTION_PERIOD: "restricted",
  DELETION_SCHEDULED: "restricted",
  DELETED: "none",
};

export function getAccessLevel(state: BillingState): AccessLevel {
  return ACCESS_BY_STATE[state];
}

/** Returns "all" for full access, the preserved-capability list otherwise, or [] once deleted. */
export function getPreservedCapabilities(state: BillingState): "all" | RestrictedCapability[] {
  const level = getAccessLevel(state);
  if (level === "full") return "all";
  if (level === "none") return [];
  return [...RESTRICTED_CAPABILITIES];
}

export type BillingLifecycleEvent =
  | "PAYMENT_FAILED"
  | "PAYMENT_RETRY_EXHAUSTED"
  | "GRACE_PERIOD_EXPIRED"
  | "RESTRICTION_ESCALATED"
  | "PAYMENT_RECOVERED"
  | "CANCEL_REQUESTED"
  | "RETENTION_PERIOD_EXPIRED"
  | "DELETION_EXECUTED";

export class InvalidBillingTransitionError extends Error {
  constructor(from: BillingState, event: BillingLifecycleEvent) {
    super(`No valid transition from ${from} on event ${event}.`);
    this.name = "InvalidBillingTransitionError";
  }
}

/**
 * Deterministic state machine implementing the §37 failed-payment
 * workflow: verify event → notify → retry → payment-update path → grace
 * period → restriction → suspension → restoration after verified payment.
 * Phase 1 has no real payment provider to emit these events yet — this is
 * the architecture the webhook handler will drive in Phase 3.
 */
export function nextBillingState(from: BillingState, event: BillingLifecycleEvent): BillingState {
  switch (event) {
    case "PAYMENT_FAILED":
      if (from === "ACTIVE") return "PAST_DUE";
      break;
    case "PAYMENT_RETRY_EXHAUSTED":
      if (from === "PAST_DUE") return "PAYMENT_RETRYING";
      if (from === "PAYMENT_RETRYING") return "GRACE_PERIOD";
      break;
    case "GRACE_PERIOD_EXPIRED":
      if (from === "GRACE_PERIOD") return "RESTRICTED";
      break;
    case "RESTRICTION_ESCALATED":
      if (from === "RESTRICTED") return "SUSPENDED";
      break;
    case "PAYMENT_RECOVERED":
      if (
        from === "PAST_DUE" ||
        from === "PAYMENT_RETRYING" ||
        from === "GRACE_PERIOD" ||
        from === "RESTRICTED" ||
        from === "SUSPENDED"
      ) {
        return "ACTIVE";
      }
      break;
    case "CANCEL_REQUESTED":
      if (from === "TRIALING" || from === "ACTIVE" || from === "RESTRICTED") return "CANCELED";
      break;
    case "RETENTION_PERIOD_EXPIRED":
      if (from === "CANCELED" || from === "EXPIRED") return "RETENTION_PERIOD";
      break;
    case "DELETION_EXECUTED":
      if (from === "RETENTION_PERIOD" || from === "DELETION_SCHEDULED") return "DELETED";
      break;
  }

  throw new InvalidBillingTransitionError(from, event);
}
