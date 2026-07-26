import "server-only";
import { BillingPortalNotAvailableError, InvalidWebhookSignatureError } from "./provider";
import type {
  BillingProvider,
  ConstructWebhookEventInput,
  CreateBillingPortalSessionInput,
  CreateCheckoutSessionInput,
  WebhookEvent,
} from "./provider";

/**
 * Deterministic, no external calls. Trusts a JSON-encoded `{id, type,
 * data}` body directly rather than verifying a real cryptographic
 * signature — there is no real provider to verify against in mock mode,
 * and pretending to verify one would misrepresent what this mode actually
 * does (the same "never overstate" discipline MockAIProvider follows,
 * src/lib/ai/mock-provider.ts). The signatureHeader is still required to
 * be a non-empty string, so a caller that forgot to pass one at all is
 * still caught.
 */
export class MockBillingProvider implements BillingProvider {
  readonly name = "mock" as const;

  constructWebhookEvent(input: ConstructWebhookEventInput): WebhookEvent {
    if (!input.signatureHeader) {
      throw new InvalidWebhookSignatureError();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      throw new InvalidWebhookSignatureError();
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { id?: unknown }).id !== "string" ||
      typeof (parsed as { type?: unknown }).type !== "string"
    ) {
      throw new InvalidWebhookSignatureError();
    }
    const event = parsed as { id: string; type: string; data: unknown };
    return { id: event.id, type: event.type, data: event.data };
  }

  async createBillingPortalSession(
    _input: CreateBillingPortalSessionInput,
  ): Promise<{ url: string }> {
    throw new BillingPortalNotAvailableError();
  }

  /**
   * No real Stripe to redirect to in mock mode — instead points at this
   * codebase's own /mock-checkout page (src/app/mock-checkout/page.tsx),
   * which carries the session's real inputs as query params and, on
   * confirm, synthesizes a checkout.session.completed-shaped event and
   * runs it through the *real* processBillingWebhook pipeline (same
   * idempotency check, same event mapping, same
   * linkBillingProviderCustomerFromWebhook call a genuine Stripe webhook
   * would trigger) rather than mutating billing state directly — so a
   * "test-mode purchase" here exercises the actual code path, not a
   * shortcut around it.
   */
  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string }> {
    const origin = new URL(input.successUrl).origin;
    const params = new URLSearchParams({
      organizationId: input.organizationId,
      productName: input.productName,
      unitAmountCents: String(input.unitAmountCents),
      currency: input.currency,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    return { url: `${origin}/mock-checkout?${params.toString()}` };
  }

  async getSubscriptionStatus(_subscriptionId: string): Promise<{ status: string }> {
    throw new BillingPortalNotAvailableError("Subscription status reconciliation");
  }
}
