import "server-only";
import { getServerEnv } from "@/lib/env";
import { MockGeneratedAppPaymentProvider } from "./mock-generated-app-payment-provider";
import { StripeGeneratedAppPaymentProvider } from "./stripe-generated-app-payment-provider";
import type { GeneratedAppPaymentProvider } from "./generated-app-payment-provider";

let cachedProvider: GeneratedAppPaymentProvider | undefined;

export function getGeneratedAppPaymentProvider(): GeneratedAppPaymentProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const env = getServerEnv();
  cachedProvider =
    env.GENERATED_APP_PAYMENT_PROVIDER === "stripe"
      ? new StripeGeneratedAppPaymentProvider()
      : new MockGeneratedAppPaymentProvider();
  return cachedProvider;
}
