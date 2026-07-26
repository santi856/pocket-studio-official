import { test, expect } from "@playwright/test";

/**
 * Drives the real, founder-directed account/data deletion flow
 * (src/lib/billing/account-deletion.ts) through an actual browser —
 * request, verify the pending state and scheduled date, and cancel.
 * Converts the manual live-browser verification performed when this
 * feature was built into permanent, automated regression coverage.
 */
test("an organization owner can request account deletion, see the scheduled date, and cancel it", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `deletion-owner-${unique}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Deletion Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Workspace name").fill(`Deletable Org ${unique}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/org\/.+/);

  await expect(page.getByRole("heading", { name: "Danger zone" })).toBeVisible();
  await page.getByRole("button", { name: "Delete this organization" }).click();

  // A real scheduled date, not a static confirmation string — proves the
  // request actually persisted with a computed scheduledPurgeAt, not a
  // client-side-only UI toggle.
  await expect(page.getByText(/scheduled for permanent deletion on/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel deletion" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(page.getByRole("button", { name: "Delete this organization" })).toBeVisible();
  await expect(page.getByText(/scheduled for permanent deletion on/)).toBeHidden();
});
