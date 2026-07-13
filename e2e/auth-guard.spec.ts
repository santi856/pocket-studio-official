import { test, expect } from "@playwright/test";

/**
 * Regression test for D-0014: an unauthenticated visitor hitting a
 * protected page must be redirected to /sign-in, not shown an uncaught
 * 500. The Level 3 phase-exit review (execution/reviews/level3/phase-1/)
 * found this behavior was fixed but had no automated coverage — this
 * closes that gap.
 */
test.describe("unauthenticated access to protected pages redirects to sign-in", () => {
  const protectedPaths = ["/dashboard", "/onboarding", "/org/anything", "/org/anything/anything"];

  for (const path of protectedPaths) {
    test(`GET ${path} redirects to /sign-in`, async ({ page }) => {
      const response = await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
      expect(response?.status()).toBeLessThan(400);
    });
  }
});

/**
 * Regression test for Phase 2 Level 3 review round 1, finding 2: a Server
 * Action invoked with an expired/absent session (a customer whose session
 * lapses while a Studio tab stays open, then clicks a button) previously
 * crashed to Next.js's raw error page instead of redirecting to sign-in,
 * because no action caught `UnauthenticatedError`. Every action now calls
 * `requireCurrentUserForAction` (src/lib/web/require-user.ts), the same
 * redirect-not-throw pattern already used for page loads.
 */
test.describe("Server Action with an expired session redirects to sign-in, not a crash page", () => {
  test("submitting the idea form after the session cookie is cleared redirects gracefully", async ({
    page,
    context,
  }) => {
    const unique = crypto.randomUUID();
    const email = `expired-session-e2e-${unique}@example.com`;
    const workspaceName = `Detailer Co ${unique}`;
    const projectName = `Booking App ${unique}`;

    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Jesse Test");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correcthorsebatterystaple");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Workspace name").fill(workspaceName);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/org\/.+/);
    await page.getByPlaceholder("New project name").fill(projectName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);

    // Simulate an expired session: the tab stays open on an already-loaded
    // Studio page, but the session cookie is gone by the time the customer
    // next submits a form.
    await context.clearCookies();

    await page.getByPlaceholder("Describe your product idea...").fill("Build a booking app.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
