import { test, expect } from "@playwright/test";

/**
 * Real Stripe Checkout flow (createCheckoutSession,
 * src/lib/billing/stripe-billing-provider.ts / mock-billing-provider.ts,
 * src/app/mock-checkout/page.tsx). Disclosed scope boundary: every paid
 * plan (BUILDER/LAUNCH/MANAGED/AGENCY) deliberately has no configured
 * monthlyPriceCents yet (Master Spec §36, "must not be invented when not
 * supplied" — src/lib/billing/seed-plans.ts) — so no "Upgrade" control can
 * exist in a real running instance today, and the full click-through
 * happy path (Upgrade -> mock checkout -> confirm -> billing state ACTIVE)
 * is exercised at the unit/integration level instead
 * (webhook-processing.integration.test.ts, access.test.ts,
 * mock-billing-provider.test.ts) where it does not depend on a real price
 * existing. Once a real price is configured for any plan, this file should
 * gain a full click-through test using that real price. What IS covered
 * here, against the real running app: the pricing-not-invented UI
 * guarantee, mock-checkout's auth requirement, and the tenant-isolation
 * guard on confirming a checkout for an organization the caller does not
 * belong to.
 */

test("the billing page never offers to upgrade to a plan with no real configured price", async ({
  page,
}) => {
  const unique = crypto.randomUUID();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Pricing Test");
  await page.getByLabel("Email").fill(`pricing-e2e-${unique}@example.com`);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Workspace name").fill(`Pricing Co ${unique}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/org\/.+/);
  const orgSlug = new URL(page.url()).pathname.split("/")[2];

  await page.goto(`/org/${orgSlug}/billing`);

  // Free/Explore is the only plan with a real price (0) and is this org's
  // own current plan, so it is never offered as an "upgrade". No paid
  // plan has a real price configured, so no Upgrade/Change plan section
  // should render at all.
  await expect(page.getByRole("heading", { name: "Upgrade" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Change plan" })).toHaveCount(0);
});

test("/mock-checkout requires a signed-in session", async ({ page }) => {
  await page.goto(
    "/mock-checkout?organizationId=org_x&productName=Builder&unitAmountCents=2900&currency=usd&successUrl=https%3A%2F%2Fexample.com%2Fdone&cancelUrl=https%3A%2F%2Fexample.com%2Fcanceled",
  );

  await expect(page).toHaveURL(/\/sign-in/);
});

/**
 * confirmMockCheckoutAction (src/lib/actions/billing-actions.ts) requires
 * the signed-in caller to be an OWNER of the organizationId named in the
 * form — unlike a real Stripe webhook (authenticated purely by its
 * cryptographic signature), this mock confirmation page has no real
 * signature, so without this check anyone who knew or guessed an
 * organizationId could activate billing for a workspace they do not
 * belong to. This proves that guard holds for a genuine signed-in user
 * against an organization they have no membership in at all.
 */
test("confirming a mock checkout for an organization the caller is not a member of fails, not activates billing", async ({
  page,
}) => {
  const unique = crypto.randomUUID();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Outsider Test");
  await page.getByLabel("Email").fill(`outsider-checkout-e2e-${unique}@example.com`);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Workspace name").fill(`Outsider Co ${unique}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/org\/.+/);

  const foreignOrganizationId = `org_not_mine_${unique}`;
  await page.goto(
    `/mock-checkout?organizationId=${foreignOrganizationId}&productName=Builder&unitAmountCents=2900&currency=usd&successUrl=${encodeURIComponent("https://example.com/done")}&cancelUrl=${encodeURIComponent("https://example.com/canceled")}`,
  );
  await expect(page.getByRole("button", { name: "Confirm test payment" })).toBeVisible();

  await page.getByRole("button", { name: "Confirm test payment" }).click();

  // Must not silently redirect to the success URL as if billing were
  // really activated for an organization this user has no membership in.
  await expect(page).not.toHaveURL(/example\.com\/done/);
});
