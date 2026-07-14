// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const WEBHOOK_SECRET = "whsec_test_secret_123";

function setEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

function signPayload(payload: string, timestamp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

function buildSignatureHeader(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  return `t=${timestamp},v1=${signPayload(payload, timestamp, secret)}`;
}

describe("StripeBillingProvider.constructWebhookEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("accepts a real, correctly-signed payload (computed with the exact same algorithm Stripe documents)", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const provider = new StripeBillingProvider();
    const rawBody = JSON.stringify({
      id: "evt_123",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_123" } },
    });

    const event = provider.constructWebhookEvent({
      rawBody,
      signatureHeader: buildSignatureHeader(rawBody, WEBHOOK_SECRET),
    });

    expect(event).toEqual({
      id: "evt_123",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_123" } },
    });
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const { InvalidWebhookSignatureError } = await import("./provider");
    const provider = new StripeBillingProvider();
    const rawBody = JSON.stringify({ id: "evt_123", type: "invoice.payment_failed", data: {} });

    expect(() =>
      provider.constructWebhookEvent({
        rawBody,
        signatureHeader: buildSignatureHeader(rawBody, "whsec_wrong_secret"),
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a tampered payload — signature was computed over a different body", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const { InvalidWebhookSignatureError } = await import("./provider");
    const provider = new StripeBillingProvider();
    const originalBody = JSON.stringify({
      id: "evt_123",
      type: "invoice.payment_failed",
      data: {},
    });
    const tamperedBody = JSON.stringify({
      id: "evt_123",
      type: "invoice.payment_succeeded",
      data: {},
    });

    expect(() =>
      provider.constructWebhookEvent({
        rawBody: tamperedBody,
        signatureHeader: buildSignatureHeader(originalBody, WEBHOOK_SECRET),
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a signature outside the replay-tolerance window, even with the correct secret", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const { InvalidWebhookSignatureError } = await import("./provider");
    const provider = new StripeBillingProvider();
    const rawBody = JSON.stringify({ id: "evt_123", type: "invoice.payment_failed", data: {} });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10_000; // far outside 300s tolerance

    expect(() =>
      provider.constructWebhookEvent({
        rawBody,
        signatureHeader: buildSignatureHeader(rawBody, WEBHOOK_SECRET, staleTimestamp),
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a malformed signature header", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const { InvalidWebhookSignatureError } = await import("./provider");
    const provider = new StripeBillingProvider();

    expect(() =>
      provider.constructWebhookEvent({ rawBody: "{}", signatureHeader: "not-a-real-header" }),
    ).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects when no STRIPE_WEBHOOK_SECRET is configured, without attempting verification", async () => {
    setEnv({
      BILLING_PROVIDER: "mock",
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const { InvalidWebhookSignatureError } = await import("./provider");
    const provider = new StripeBillingProvider();
    const rawBody = JSON.stringify({ id: "evt_123", type: "invoice.payment_failed", data: {} });

    expect(() =>
      provider.constructWebhookEvent({
        rawBody,
        signatureHeader: buildSignatureHeader(rawBody, WEBHOOK_SECRET),
      }),
    ).toThrow(InvalidWebhookSignatureError);
  });
});

describe("StripeBillingProvider.createBillingPortalSession", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a real Stripe API request and returns the portal URL", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const provider = new StripeBillingProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ url: "https://billing.stripe.com/session/test_123" }),
      text: async () => "",
    } as Response);

    const result = await provider.createBillingPortalSession({
      customerId: "cus_123",
      returnUrl: "https://example.com/billing",
    });

    expect(result).toEqual({ url: "https://billing.stripe.com/session/test_123" });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/billing_portal/sessions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk_test_123" });
    expect(init.body).toContain("customer=cus_123");
  });

  it("throws StripeRequestError on a non-2xx response", async () => {
    const { StripeBillingProvider, StripeRequestError } = await import("./stripe-billing-provider");
    const provider = new StripeBillingProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "invalid api key",
      json: async () => ({}),
    } as Response);

    await expect(
      provider.createBillingPortalSession({ customerId: "cus_123", returnUrl: "https://x.test" }),
    ).rejects.toBeInstanceOf(StripeRequestError);
  });

  it("throws BillingPortalNotAvailableError when no STRIPE_SECRET_KEY is configured", async () => {
    setEnv({
      BILLING_PROVIDER: "mock",
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const { BillingPortalNotAvailableError } = await import("./provider");
    const provider = new StripeBillingProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;

    await expect(
      provider.createBillingPortalSession({ customerId: "cus_123", returnUrl: "https://x.test" }),
    ).rejects.toBeInstanceOf(BillingPortalNotAvailableError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("StripeBillingProvider.getSubscriptionStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv({
      BILLING_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches the real subscription status via a GET request", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const provider = new StripeBillingProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "past_due" }),
      text: async () => "",
    } as Response);

    const result = await provider.getSubscriptionStatus("sub_123");

    expect(result).toEqual({ status: "past_due" });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/subscriptions/sub_123");
    expect(init.method).toBe("GET");
  });

  it("throws BillingSubscriptionNotFoundOnProviderError on a 404", async () => {
    const { StripeBillingProvider } = await import("./stripe-billing-provider");
    const { BillingSubscriptionNotFoundOnProviderError } = await import("./provider");
    const provider = new StripeBillingProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "no such subscription",
      json: async () => ({}),
    } as Response);

    await expect(provider.getSubscriptionStatus("sub_missing")).rejects.toBeInstanceOf(
      BillingSubscriptionNotFoundOnProviderError,
    );
  });
});
