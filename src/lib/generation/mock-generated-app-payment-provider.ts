import "server-only";
import type {
  ChargeResult,
  CreateChargeInput,
  GeneratedAppPaymentProvider,
} from "./generated-app-payment-provider";

/**
 * Deterministic, no external calls — the full generated-app checkout flow
 * can be built and tested end to end without a live connected account.
 * Succeeds for any positive amount; a non-positive amount is rejected the
 * same way a real provider's API would reject it (never silently
 * accepted), so callers get realistic failure-path coverage even in mock
 * mode.
 */
export class MockGeneratedAppPaymentProvider implements GeneratedAppPaymentProvider {
  readonly name = "mock" as const;

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    if (input.amountCents <= 0) {
      return { status: "FAILED", failureReason: "Amount must be a positive integer." };
    }
    return { status: "SUCCEEDED", providerChargeId: `mock_charge_${crypto.randomUUID()}` };
  }
}
