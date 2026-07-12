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
