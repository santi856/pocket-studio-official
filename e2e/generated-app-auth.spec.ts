import { test, expect } from "@playwright/test";

/**
 * Drives the real, unauthenticated customer-facing signup/signin flow for a
 * generated product's own end user (src/lib/generation/generated-app-auth.ts,
 * generated-app-session.ts) through an actual browser — the single highest-
 * priority launch blocker from the Phase 3 definitive founder report before
 * this feature existed ("a generated application had no live, unauthenticated
 * end-user signup/login route"). Manually verified once via live browser
 * automation when the feature was built; this converts that one-off
 * verification into permanent, automated regression coverage.
 */
test("a generated app's own customer can sign up, use the app, sign out, and sign back in", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const ownerEmail = `gen-app-owner-${unique}@example.com`;
  const customerEmail = `gen-app-customer-${unique}@example.com`;

  // --- Founder side: sign up, create org/project, generate an app ---
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Owner Test");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Workspace name").fill(`Detailer Co ${unique}`);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/org\/.+/);
  const orgUrl = new URL(page.url());
  const [, , orgSlug] = orgUrl.pathname.split("/");
  await page.getByPlaceholder("New project name").fill(`Booking App ${unique}`);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await page
    .getByPlaceholder("Describe your product idea...")
    .fill("Build a premium booking app for mobile detailers.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Build a premium booking app" })).toBeVisible();

  await page.getByRole("button", { name: "Generate app" }).click();
  await expect(page.getByText(/Build Plan v\d+ — Ready/)).toBeVisible({ timeout: 15_000 });

  const projectSlug = page.url().split("/").pop()!;

  // --- Customer side: real, unauthenticated signup for the generated app ---
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto(`/org/${orgSlug}/${projectSlug}/app/sign-up`);
  await page.getByLabel("Name").fill("Real Customer");
  await page.getByLabel("Email").fill(customerEmail);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();

  // Lands inside the generated app itself — its own Home screen, its own
  // session, never the founder's platform session.
  await expect(page).toHaveURL(new RegExp(`/org/${orgSlug}/${projectSlug}/app/`));
  await expect(page.getByText("Real Customer")).toBeVisible();

  // --- Sign out genuinely clears the session — direct URL access is blocked, not just hidden ---
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(new RegExp(`/org/${orgSlug}/${projectSlug}/app/sign-in`));

  await page.goto(`/org/${orgSlug}/${projectSlug}/app/Home`);
  await expect(page).toHaveURL(new RegExp(`/org/${orgSlug}/${projectSlug}/app/sign-in`));

  // --- Sign back in with the same real credentials restores access ---
  await page.getByLabel("Email").fill(customerEmail);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/org/${orgSlug}/${projectSlug}/app/`));
  await expect(page.getByText("Real Customer")).toBeVisible();

  // --- Wrong password is cleanly rejected, not a crash ---
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(customerEmail);
  await page.getByLabel("Password").fill("wrong-password-entirely");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});
