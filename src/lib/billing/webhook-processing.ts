import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getBillingProvider } from "./get-billing-provider";
import {
  applyBillingLifecycleEventFromWebhook,
  findOrganizationIdByBillingProviderCustomerId,
} from "./subscription";
import { InvalidBillingTransitionError } from "./access";
import type { BillingLifecycleEvent } from "./access";

export class UnrecognizedWebhookOrganizationError extends Error {
  constructor() {
    super("This webhook event's customer is not linked to any organization.");
    this.name = "UnrecognizedWebhookOrganizationError";
  }
}

// A narrow, real subset of Stripe's actual event types — only the ones
// the nonpayment/lifecycle state machine (src/lib/billing/access.ts)
// already models. An unmapped event type is explicitly ignored (not an
// error): Stripe sends many event types this codebase has no state
// machine transition for, and treating every unmapped one as a failure
// would make webhook processing brittle against Stripe's own evolving
// event catalog.
const STRIPE_EVENT_TYPE_MAP: Readonly<Record<string, BillingLifecycleEvent>> = {
  "invoice.payment_failed": "PAYMENT_FAILED",
  "invoice.payment_succeeded": "PAYMENT_RECOVERED",
  "customer.subscription.deleted": "CANCEL_REQUESTED",
};

export type WebhookProcessingResult =
  | { status: "processed"; event: BillingLifecycleEvent }
  | { status: "ignored_unmapped_event_type"; providerEventType: string }
  | { status: "duplicate_ignored" };

function extractCustomerId(eventData: unknown): string | null {
  const object = (eventData as { object?: { customer?: unknown } } | null)?.object;
  const customer = object?.customer;
  return typeof customer === "string" ? customer : null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * The real webhook entry point (Master Spec §37, §61): verifies the
 * signature (throws InvalidWebhookSignatureError if it does not verify —
 * never trusts an unverified payload), records the event id for
 * idempotency (Stripe redelivers, at-least-once, never exactly-once — a
 * redelivered event must be a safe no-op, never a double-applied billing
 * transition), maps the provider's event type to this codebase's own
 * BillingLifecycleEvent, resolves which organization it belongs to, and
 * applies the real state transition.
 */
export async function processBillingWebhook(
  rawBody: string,
  signatureHeader: string,
): Promise<WebhookProcessingResult> {
  const provider = getBillingProvider();
  const event = provider.constructWebhookEvent({ rawBody, signatureHeader });

  try {
    await db.processedWebhookEvent.create({
      data: { provider: provider.name, providerEventId: event.id },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { status: "duplicate_ignored" };
    }
    throw error;
  }

  const mappedEvent = STRIPE_EVENT_TYPE_MAP[event.type];
  if (!mappedEvent) {
    return { status: "ignored_unmapped_event_type", providerEventType: event.type };
  }

  const customerId = extractCustomerId(event.data);
  const organizationId = customerId
    ? await findOrganizationIdByBillingProviderCustomerId(customerId)
    : null;
  if (!organizationId) {
    throw new UnrecognizedWebhookOrganizationError();
  }

  try {
    await applyBillingLifecycleEventFromWebhook(organizationId, mappedEvent);
  } catch (error) {
    // Real Stripe usage: invoice.payment_succeeded fires on every
    // successful invoice charge, not just failure recovery — overwhelmingly
    // the ordinary renewal of an already-ACTIVE subscription, which has
    // nothing to "recover" from. nextBillingState (src/lib/billing/access.ts)
    // only defines PAYMENT_RECOVERED as a real transition from a
    // failure-adjacent state; an ACTIVE/TRIALING-origin success (or any
    // other state with no defined transition) is a genuine no-op, not an
    // error — the event was still real and is still durably recorded via
    // the idempotency check above, it simply implies no BillingEvent state
    // change.
    if (mappedEvent === "PAYMENT_RECOVERED" && error instanceof InvalidBillingTransitionError) {
      return { status: "processed", event: mappedEvent };
    }
    throw error;
  }
  return { status: "processed", event: mappedEvent };
}
