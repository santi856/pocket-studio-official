import { describe, expect, it } from "vitest";
import { MockBillingProvider } from "./mock-billing-provider";
import { BillingPortalNotAvailableError, InvalidWebhookSignatureError } from "./provider";

describe("MockBillingProvider", () => {
  const provider = new MockBillingProvider();

  it("parses a well-formed JSON event body", () => {
    const rawBody = JSON.stringify({ id: "evt_1", type: "invoice.payment_failed", data: { a: 1 } });

    const event = provider.constructWebhookEvent({
      rawBody,
      signatureHeader: "any-non-empty-value",
    });

    expect(event).toEqual({ id: "evt_1", type: "invoice.payment_failed", data: { a: 1 } });
  });

  it("rejects a missing signature header", () => {
    const rawBody = JSON.stringify({ id: "evt_1", type: "invoice.payment_failed", data: {} });

    expect(() => provider.constructWebhookEvent({ rawBody, signatureHeader: "" })).toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it("rejects invalid JSON", () => {
    expect(() =>
      provider.constructWebhookEvent({ rawBody: "not json", signatureHeader: "x" }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a body missing id or type", () => {
    expect(() =>
      provider.constructWebhookEvent({
        rawBody: JSON.stringify({ id: "evt_1" }),
        signatureHeader: "x",
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it("has no billing portal in mock mode — disclosed via a real error, not a fake URL", async () => {
    await expect(
      provider.createBillingPortalSession({ customerId: "cus_1", returnUrl: "https://x.test" }),
    ).rejects.toBeInstanceOf(BillingPortalNotAvailableError);
  });

  it("has no real subscription status to reconcile against in mock mode", async () => {
    await expect(provider.getSubscriptionStatus("sub_1")).rejects.toBeInstanceOf(
      BillingPortalNotAvailableError,
    );
  });

  it("returns a local /mock-checkout URL carrying the session's real inputs as query params", async () => {
    const session = await provider.createCheckoutSession({
      organizationId: "org_1",
      productName: "Builder",
      unitAmountCents: 2900,
      currency: "usd",
      successUrl: "https://app.test/org/acme/billing?notice=done",
      cancelUrl: "https://app.test/org/acme/billing?notice=canceled",
    });

    const url = new URL(session.url);
    expect(url.origin).toBe("https://app.test");
    expect(url.pathname).toBe("/mock-checkout");
    expect(url.searchParams.get("organizationId")).toBe("org_1");
    expect(url.searchParams.get("productName")).toBe("Builder");
    expect(url.searchParams.get("unitAmountCents")).toBe("2900");
    expect(url.searchParams.get("currency")).toBe("usd");
    expect(url.searchParams.get("successUrl")).toBe(
      "https://app.test/org/acme/billing?notice=done",
    );
    expect(url.searchParams.get("cancelUrl")).toBe(
      "https://app.test/org/acme/billing?notice=canceled",
    );
  });
});
