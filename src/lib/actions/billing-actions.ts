"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import { getSubscription } from "@/lib/billing/subscription";
import { getLatestPlan } from "@/lib/billing/plans";
import { getBillingProvider } from "@/lib/billing/get-billing-provider";
import { reconcileSubscriptionWithProvider } from "@/lib/billing/reconciliation";
import { BillingPortalNotAvailableError } from "@/lib/billing/provider";
import { processBillingWebhook } from "@/lib/billing/webhook-processing";
import type { PlanKey } from "@/generated/prisma/client";

async function resolveOrganizationBySlug(organizationSlug: string) {
  const organization = await db.organization.findUnique({ where: { slug: organizationSlug } });
  if (!organization) {
    redirect("/dashboard");
  }
  return organization;
}

/**
 * Redirects the customer to a real Stripe-hosted billing portal session
 * (Master Spec §61 "billing portal"). Only reachable when this
 * organization already has a billingProviderCustomerId — the billing page
 * only renders this action's form in that case (no real checkout flow
 * exists yet to create one, a disclosed limitation of this unit).
 * getSubscription itself enforces membership — never trust a
 * client-submitted organizationSlug without it.
 */
export async function createBillingPortalSessionAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const organization = await resolveOrganizationBySlug(organizationSlug);

  const subscription = await getSubscription(user.id, organization.id);
  if (!subscription?.billingProviderCustomerId) {
    redirect(
      `/org/${organizationSlug}/billing?error=${encodeURIComponent("No billing provider connected yet.")}`,
    );
  }

  // Built from the request's own Host header, not a client-submitted
  // value — never trust the client for the URL Stripe redirects back to.
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const host = requestHeaders.get("host");
  const returnUrl = `${protocol}://${host}/org/${organizationSlug}/billing`;

  let session;
  try {
    session = await getBillingProvider().createBillingPortalSession({
      customerId: subscription.billingProviderCustomerId,
      returnUrl,
    });
  } catch (error) {
    if (error instanceof BillingPortalNotAvailableError) {
      redirect(`/org/${organizationSlug}/billing?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(session.url);
}

/**
 * Starts a real Stripe Checkout session (or, in mock mode, the local
 * /mock-checkout simulation) for a monthly subscription to the given plan
 * (Master Spec §36 "monthly subscriptions"). OWNER-gated, same rationale as
 * createSubscription/transitionBillingState: initiating a real payment
 * obligation for the organization is an owner-level action, not something
 * every member can trigger. Reads the price from the Plan Registry's own
 * monthlyPriceCents — if a plan has no configured price, this action fails
 * with a clear message rather than inventing one (Master Spec §36).
 */
export async function createCheckoutSessionAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const planKey = String(formData.get("planKey") ?? "") as PlanKey;
  const organization = await resolveOrganizationBySlug(organizationSlug);

  await requireOrganizationMembership(user.id, organization.id, "OWNER");

  const plan = await getLatestPlan(planKey);
  if (!plan || plan.monthlyPriceCents == null) {
    redirect(
      `/org/${organizationSlug}/billing?error=${encodeURIComponent("This plan has no configured price yet.")}`,
    );
  }

  // Built from the request's own Host header, not a client-submitted
  // value — never trust the client for the URLs the provider redirects
  // back to.
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const host = requestHeaders.get("host");
  const billingUrl = `${protocol}://${host}/org/${organizationSlug}/billing`;

  const session = await getBillingProvider().createCheckoutSession({
    organizationId: organization.id,
    productName: plan.name,
    unitAmountCents: plan.monthlyPriceCents,
    currency: plan.currency,
    successUrl: `${billingUrl}?notice=${encodeURIComponent("Checkout complete. Your plan will update once the payment is confirmed.")}`,
    cancelUrl: `${billingUrl}?notice=${encodeURIComponent("Checkout canceled.")}`,
  });

  redirect(session.url);
}

/**
 * Confirms the local mock-checkout simulation (mock-billing-provider.ts):
 * synthesizes a checkout.session.completed-shaped event, the same shape
 * Stripe itself sends, and runs it through the real processBillingWebhook
 * pipeline — same idempotency check, same event mapping, same
 * linkBillingProviderCustomerFromWebhook call a genuine webhook would
 * trigger. Only reachable when BILLING_PROVIDER=mock (the default);
 * refuses to run against a real Stripe connection, since this is a test
 * simulation, not a real payment.
 *
 * A real Stripe webhook is authenticated by its cryptographic signature
 * alone, with no Pocket Studio user actor — but this mock page has no real
 * signature, just a literal placeholder string, so unlike the real webhook
 * route it MUST require the caller to actually be an OWNER of the
 * organizationId named in the form. Without this check, anyone who knew
 * or guessed an organizationId could activate billing for a workspace they
 * do not belong to, purely because it is reachable as a normal page rather
 * than a provider-signed server-to-server callback.
 */
export async function confirmMockCheckoutAction(formData: FormData): Promise<void> {
  const provider = getBillingProvider();
  if (provider.name !== "mock") {
    throw new Error("Mock checkout confirmation is only available in mock billing mode.");
  }

  const user = await requireCurrentUserForAction();
  const organizationId = String(formData.get("organizationId") ?? "");
  await requireOrganizationMembership(user.id, organizationId, "OWNER");

  const successUrl = String(formData.get("successUrl") ?? "");

  const syntheticEvent = {
    id: `mock_evt_${randomUUID()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        customer: `mock_cus_${organizationId}`,
        subscription: `mock_sub_${randomUUID()}`,
        client_reference_id: organizationId,
      },
    },
  };

  await processBillingWebhook(JSON.stringify(syntheticEvent), "mock_signature");

  redirect(successUrl);
}

/**
 * Cancels the local mock-checkout simulation without applying any billing
 * state change — mirrors a real Stripe Checkout session being abandoned.
 */
export async function cancelMockCheckoutAction(formData: FormData): Promise<void> {
  const cancelUrl = String(formData.get("cancelUrl") ?? "");
  redirect(cancelUrl);
}

/**
 * Re-checks this organization's local billing state against the real
 * provider (Master Spec §37). reconcileSubscriptionWithProvider itself
 * enforces membership.
 */
export async function reconcileSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const organization = await resolveOrganizationBySlug(organizationSlug);

  const result = await reconcileSubscriptionWithProvider(user.id, organization.id);

  const message =
    result.status === "not_linked"
      ? "No billing provider connected yet."
      : result.status === "in_sync"
        ? "Billing state is in sync with the provider."
        : `Drift detected: provider reports "${result.providerStatus}", local record is "${result.localState}". Recorded for review.`;

  redirect(`/org/${organizationSlug}/billing?notice=${encodeURIComponent(message)}`);
}
