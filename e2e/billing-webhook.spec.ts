import { test, expect } from "@playwright/test";

/**
 * P3-04: proves /api/webhooks/stripe is a real, live, HTTP-reachable
 * endpoint (BILLING_PROVIDER=mock in this dev server) — not just callable
 * from a test file. Covers the paths reachable without a real Stripe
 * connection: missing signature, malformed payload, an event for a
 * real-shaped but never-linked customer id, and (below) a real Checkout
 * Session's checkout.session.completed event whose client_reference_id
 * does not resolve to any organization — all resolving gracefully instead
 * of crashing.
 */
test.describe("/api/webhooks/stripe", () => {
  test("rejects a request with no Stripe-Signature header", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", {
      data: JSON.stringify({ id: "evt_1", type: "invoice.payment_failed", data: {} }),
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("Missing Stripe-Signature header");
  });

  test("rejects a malformed event body gracefully, not with a crash page", async ({ request }) => {
    const response = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": "mock-signature" },
      data: "not valid json",
    });

    expect(response.status()).toBe(400);
  });

  test("acknowledges a well-formed event for a customer no organization is linked to, not with a crash", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": "mock-signature" },
      data: JSON.stringify({
        id: `evt_e2e_${crypto.randomUUID()}`,
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_never_linked_e2e" } },
      }),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("unrecognized_organization");
  });

  /**
   * The real Stripe Checkout flow (createCheckoutSession,
   * src/lib/billing/stripe-billing-provider.ts /
   * src/app/mock-checkout/page.tsx): a checkout.session.completed event
   * whose client_reference_id does not resolve to any real organization
   * (a stale link, or an organization deleted between session creation and
   * completion) must acknowledge gracefully — not crash with an uncaught
   * SubscriptionNotFoundError — since Stripe retries non-2xx responses
   * indefinitely and this client_reference_id will never resolve on
   * retry either.
   */
  test("acknowledges a checkout.session.completed event whose client_reference_id resolves to no real organization", async ({
    request,
  }) => {
    const response = await request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": "mock-signature" },
      data: JSON.stringify({
        id: `evt_e2e_checkout_${crypto.randomUUID()}`,
        type: "checkout.session.completed",
        data: {
          object: {
            customer: "cus_e2e_checkout_orphan",
            subscription: "sub_e2e_checkout_orphan",
            client_reference_id: "org_never_existed_e2e",
          },
        },
      }),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("unrecognized_organization");
  });
});
