import "server-only";

export type WebhookEvent = {
  /** The provider's own event id — the idempotency key for webhook processing. */
  id: string;
  type: string;
  data: unknown;
};

export type ConstructWebhookEventInput = {
  rawBody: string;
  signatureHeader: string;
};

export type CreateBillingPortalSessionInput = {
  customerId: string;
  returnUrl: string;
};

export class BillingSubscriptionNotFoundOnProviderError extends Error {
  constructor() {
    super("The billing provider has no record of this subscription.");
    this.name = "BillingSubscriptionNotFoundOnProviderError";
  }
}

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Webhook signature verification failed.");
    this.name = "InvalidWebhookSignatureError";
  }
}

export class BillingPortalNotAvailableError extends Error {
  constructor(action = "A billing portal session") {
    super(`${action} requires a connected billing provider.`);
    this.name = "BillingPortalNotAvailableError";
  }
}

/**
 * One interface, swappable implementations — the same pattern established
 * for AIProvider (P3-01, src/lib/ai/provider.ts). MockBillingProvider is
 * deterministic and makes no external calls; StripeBillingProvider is a
 * real connection to Stripe's API (Master Spec §61-§62, Phase 3). Selected
 * via BILLING_PROVIDER (src/lib/env.ts) — call sites never need to change
 * based on which one is active.
 */
export interface BillingProvider {
  readonly name: "mock" | "stripe";
  /**
   * Verifies the webhook signature and parses the raw request body into a
   * WebhookEvent. Throws InvalidWebhookSignatureError if the signature
   * does not verify — a webhook payload is never trusted unverified,
   * since Master Spec §37's "billing provider state is authoritative"
   * only holds if the message is provably from the real provider, not
   * anyone who can POST to a public URL.
   */
  constructWebhookEvent(input: ConstructWebhookEventInput): WebhookEvent;
  createBillingPortalSession(input: CreateBillingPortalSessionInput): Promise<{ url: string }>;
  /**
   * The provider's own real-time status for a subscription — used only
   * for reconciliation (comparing this against the locally recorded
   * billingState to detect drift from a missed or failed webhook), never
   * as a substitute for the webhook-driven state machine itself.
   */
  getSubscriptionStatus(subscriptionId: string): Promise<{ status: string }>;
}
