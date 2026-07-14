"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { db } from "@/lib/db";
import { getSubscription } from "@/lib/billing/subscription";
import { getBillingProvider } from "@/lib/billing/get-billing-provider";
import { reconcileSubscriptionWithProvider } from "@/lib/billing/reconciliation";
import { BillingPortalNotAvailableError } from "@/lib/billing/provider";

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
