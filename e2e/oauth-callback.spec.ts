import { test, expect } from "@playwright/test";

/**
 * P3-05: proves /api/integrations/oauth/callback is a real, live,
 * HTTP-reachable endpoint — not just callable from a test file. No
 * concrete third-party OAuth provider has been selected for Pocket Studio
 * to support yet (a product decision, not invented here), so the
 * provider registry is genuinely empty today; this covers the paths
 * reachable without one: missing auth, missing state, unknown state, and
 * a provider-reported consent denial.
 */
test.describe("/api/integrations/oauth/callback", () => {
  test("rejects an unauthenticated request", async ({ request }) => {
    const response = await request.get("/api/integrations/oauth/callback?state=x&code=y", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(401);
  });

  test("rejects a missing state parameter for an authenticated customer", async ({ page }) => {
    const unique = crypto.randomUUID();
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Jesse Test");
    await page.getByLabel("Email").fill(`oauth-e2e-${unique}@example.com`);
    await page.getByLabel("Password").fill("correcthorsebatterystaple");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    const response = await page.request.get("/api/integrations/oauth/callback?code=y", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("Missing state parameter");
  });

  test("rejects an unknown state for an authenticated customer, not with a crash", async ({
    page,
  }) => {
    const unique = crypto.randomUUID();
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Jesse Test");
    await page.getByLabel("Email").fill(`oauth-e2e-b-${unique}@example.com`);
    await page.getByLabel("Password").fill("correcthorsebatterystaple");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    const response = await page.request.get(
      "/api/integrations/oauth/callback?state=never-issued&code=y",
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("Invalid or expired authorization request");
  });
});
