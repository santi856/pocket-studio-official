import { notFound } from "next/navigation";
import { requireUserForPage } from "@/lib/web/require-user";
import { getBillingProvider } from "@/lib/billing/get-billing-provider";
import { confirmMockCheckoutAction, cancelMockCheckoutAction } from "@/lib/actions/billing-actions";

/**
 * The mock-mode stand-in for a real Stripe-hosted Checkout page
 * (MockBillingProvider.createCheckoutSession). Never reachable when
 * BILLING_PROVIDER=stripe — this simulates a test-mode purchase, it is not
 * one, and must not be mistaken for a real payment surface.
 */
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    organizationId?: string;
    productName?: string;
    unitAmountCents?: string;
    currency?: string;
    successUrl?: string;
    cancelUrl?: string;
  }>;
}) {
  const provider = getBillingProvider();
  if (provider.name !== "mock") {
    notFound();
  }

  await requireUserForPage();

  const { organizationId, productName, unitAmountCents, currency, successUrl, cancelUrl } =
    await searchParams;

  if (
    !organizationId ||
    !productName ||
    !unitAmountCents ||
    !currency ||
    !successUrl ||
    !cancelUrl
  ) {
    notFound();
  }

  const amount = (Number(unitAmountCents) / 100).toFixed(2);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
          Test-mode checkout simulation
        </p>
        <h1 className="mt-2 text-lg font-semibold text-black dark:text-white">{productName}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {currency.toUpperCase()} ${amount} / month
        </p>
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
          No real payment provider is connected. Confirming this simulates a successful Stripe
          Checkout completion and runs it through the real webhook-processing pipeline.
        </p>

        <div className="mt-6 flex gap-3">
          <form action={confirmMockCheckoutAction}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="successUrl" value={successUrl} />
            <button
              type="submit"
              className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Confirm test payment
            </button>
          </form>
          <form action={cancelMockCheckoutAction}>
            <input type="hidden" name="cancelUrl" value={cancelUrl} />
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-black hover:bg-zinc-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
