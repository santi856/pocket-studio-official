import { test, expect } from "@playwright/test";

/**
 * P3-04: proves /api/webhooks/stripe is a real, live, HTTP-reachable
 * endpoint (BILLING_PROVIDER=mock in this dev server) — not just callable
 * from a test file. No UI exists yet to link an organization to a real
 * billing-provider customer (disclosed limitation: no checkout flow in
 * this unit's scope), so this covers the paths reachable without one:
 * missing signature, malformed payload, and an event for a real-shaped
 * but never-linked customer id resolving gracefully instead of crashing.
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
});
