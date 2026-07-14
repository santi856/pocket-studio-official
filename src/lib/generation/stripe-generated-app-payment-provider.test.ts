import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StripeGeneratedAppPaymentProvider } from "./stripe-generated-app-payment-provider";

describe("StripeGeneratedAppPaymentProvider", () => {
  const provider = new StripeGeneratedAppPaymentProvider();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("charges using the connected account's own access token, never a platform secret", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "ch_real_123", status: "succeeded" }),
    } as Response);

    const result = await provider.createCharge({
      accessToken: "connected_account_token",
      amountCents: 2500,
      currency: "usd",
      description: "Appointment deposit",
      paymentMethodToken: "tok_visa",
    });

    expect(result).toEqual({ status: "SUCCEEDED", providerChargeId: "ch_real_123" });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/charges");
    expect(init.headers).toMatchObject({ Authorization: "Bearer connected_account_token" });
    expect(init.body).toContain("amount=2500");
    expect(init.body).toContain("source=tok_visa");
  });

  it("fails without making a network call when no payment method token is provided", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;

    const result = await provider.createCharge({
      accessToken: "connected_account_token",
      amountCents: 2500,
      currency: "usd",
      description: "Appointment deposit",
    });

    expect(result.status).toBe("FAILED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports a real provider decline as FAILED, not an uncaught error", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: { message: "Your card was declined." } }),
    } as Response);

    const result = await provider.createCharge({
      accessToken: "connected_account_token",
      amountCents: 2500,
      currency: "usd",
      description: "Appointment deposit",
      paymentMethodToken: "tok_declined",
    });

    expect(result).toEqual({ status: "FAILED", failureReason: "Your card was declined." });
  });

  it("throws StripeChargeRequestError when the network call itself fails", async () => {
    const { StripeChargeRequestError } = await import("./stripe-generated-app-payment-provider");
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(
      provider.createCharge({
        accessToken: "connected_account_token",
        amountCents: 2500,
        currency: "usd",
        description: "Appointment deposit",
        paymentMethodToken: "tok_visa",
      }),
    ).rejects.toBeInstanceOf(StripeChargeRequestError);
  });
});
