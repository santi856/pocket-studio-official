import { test, expect } from "@playwright/test";

/**
 * Master Spec §56: "The first supported demonstration is: 'Build a
 * premium booking app for mobile detailers.'" Drives the exact official
 * sentence through a real browser, end to end: sign up, describe the idea,
 * Generate app, and visit every screen the Build Plan actually produced —
 * proving the required demonstration is live, not just unit-tested.
 *
 * Per official-demonstration.integration.test.ts, this specific sentence
 * (no "database"/"deposit"/"workflow" keywords) produces only the base
 * Home and Browse screens today, not §56's full customer/owner/data
 * lists — this test verifies that honest baseline is real and live, not
 * §56's full vision.
 */
test("official demonstration: the exact Master Spec §56 sentence generates and previews live", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `demo-e2e-${unique}@example.com`;
  const workspaceName = `Detailer Co ${unique}`;
  const projectName = `Detailer Booking App ${unique}`;

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

  await page
    .getByPlaceholder("Describe your product idea...")
    .fill("Build a premium booking app for mobile detailers.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Build a premium booking app" })).toBeVisible();
  await expect(page.getByText("For: mobile detailers")).toBeVisible();

  await page.getByRole("button", { name: "Generate app" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText("Build Plan v1 —")).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  // Both screens the deterministic pipeline produced from this exact
  // official sentence are real, reachable, live routes.
  await page.getByRole("link", { name: "Preview: Home" }).click();
  await expect(page).toHaveURL(/\/preview\/Home$/);
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Studio" }).click();
  await page.getByRole("link", { name: "Preview: Browse" }).click();
  await expect(page).toHaveURL(/\/preview\/Browse$/);
  await expect(page.getByRole("heading", { name: "Browse" })).toBeVisible();
});
