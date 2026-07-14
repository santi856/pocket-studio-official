import "server-only";
import { getServerEnv } from "@/lib/env";
import { MockBillingProvider } from "./mock-billing-provider";
import { StripeBillingProvider } from "./stripe-billing-provider";
import type { BillingProvider } from "./provider";

let cachedProvider: BillingProvider | undefined;

export function getBillingProvider(): BillingProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const env = getServerEnv();
  cachedProvider =
    env.BILLING_PROVIDER === "stripe" ? new StripeBillingProvider() : new MockBillingProvider();
  return cachedProvider;
}
