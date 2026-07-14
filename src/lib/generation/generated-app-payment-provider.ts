import "server-only";

export type CreateChargeInput = {
  /** The customer's own connected payment-provider account credential (P3-05 OAuth), never Pocket Studio's own. */
  accessToken: string;
  amountCents: number;
  currency: string;
  description: string;
  /**
   * An already-tokenized payment method (e.g. a Stripe.js token) —
   * required by any real provider, optional here because no client-side
   * card-tokenization UI exists yet to produce one (disclosed limitation,
   * P3-06). Raw card details are never accepted server-side, by design —
   * that would be a real PCI-compliance violation, not a corner to cut.
   */
  paymentMethodToken?: string;
};

export type ChargeResult =
  { status: "SUCCEEDED"; providerChargeId: string } | { status: "FAILED"; failureReason: string };

/**
 * One interface, swappable implementations — the same pattern established
 * for AIProvider (P3-01) and BillingProvider (P3-04). Unlike those two,
 * this is never selected by a single platform-wide credential: a real
 * charge always authenticates as the *customer's own* connected account
 * (accessToken), never a Pocket-Studio-owned secret, since this is the
 * generated product's revenue, not Pocket Studio's (Master Spec §61).
 */
export interface GeneratedAppPaymentProvider {
  readonly name: "mock" | "stripe";
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
}
