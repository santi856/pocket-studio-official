import "server-only";
import type {
  ChargeResult,
  CreateChargeInput,
  GeneratedAppPaymentProvider,
} from "./generated-app-payment-provider";

const STRIPE_CHARGES_URL = "https://api.stripe.com/v1/charges";
const REQUEST_TIMEOUT_MS = 30_000;

export class StripeChargeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeChargeRequestError";
  }
}

/**
 * Real charge creation against a *customer's own* connected Stripe
 * account (Master Spec §61 "customer-owned generated-app payment
 * connections") — authenticates with the connected account's own OAuth
 * access token (input.accessToken, from the P3-05 connection flow), never
 * a Pocket-Studio-owned secret, so the charge and its funds belong to the
 * customer's account directly (the standard OAuth-Connect charge model,
 * distinct from a platform-key "on behalf of" charge). Raw fetch, not the
 * `stripe` SDK, matching this codebase's established precedent (P3-01
 * D-0047, P3-04 D-0050).
 */
export class StripeGeneratedAppPaymentProvider implements GeneratedAppPaymentProvider {
  readonly name = "stripe" as const;

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    if (!input.paymentMethodToken) {
      return {
        status: "FAILED",
        failureReason: "No payment method token was provided — nothing to charge.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(STRIPE_CHARGES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          amount: String(input.amountCents),
          currency: input.currency,
          description: input.description,
          source: input.paymentMethodToken,
        }).toString(),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new StripeChargeRequestError(
          `Stripe charge request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
        );
      }
      throw new StripeChargeRequestError(
        `Stripe charge request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = (await response.json()) as {
      id?: string;
      status?: string;
      error?: { message?: string };
    };

    if (!response.ok || data.error) {
      return {
        status: "FAILED",
        failureReason: data.error?.message ?? `Stripe API returned ${response.status}.`,
      };
    }
    if (!data.id) {
      throw new StripeChargeRequestError("Stripe charge response did not include an id.");
    }

    return { status: "SUCCEEDED", providerChargeId: data.id };
  }
}
