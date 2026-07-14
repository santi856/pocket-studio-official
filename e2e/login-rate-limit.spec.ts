import { test, expect } from "@playwright/test";

/**
 * P3-02: production auth hardening. Proves the sign-in brute-force
 * lockout (src/lib/auth/login-rate-limit.ts) works end to end through the
 * real form, not just at the service-function level — 5 failed attempts
 * lock out further attempts against that email, including a correctly
 * password-guessed 6th attempt.
 */
test("repeated failed sign-ins lock the account out, even once the correct password is used", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `rate-limit-e2e-${unique}@example.com`;
  const correctPassword = "correcthorsebatterystaple";

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Jesse Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(correctPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.context().clearCookies();
  await page.goto("/sign-in");

  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }

  // The 6th attempt, with the *correct* password, is still locked out —
  // proves this is a real account-level lockout, not just a wrong-password
  // message that happens to repeat.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(correctPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Too many attempts. Try again in a few minutes.")).toBeVisible();
});
