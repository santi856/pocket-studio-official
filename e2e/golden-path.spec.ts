import { test, expect } from "@playwright/test";

/**
 * Drives the real Phase 1 customer flow (Master Spec §51) through an
 * actual browser: sign up → onboarding → create project → describe an
 * idea → see generated Product Intelligence in Simple Mode → switch to
 * Expert Mode and see the same state represented structurally. This is
 * the only reliable way to verify Server Actions actually work end to
 * end — they use React's action-invocation protocol, which plain HTTP
 * clients (curl) cannot drive.
 */
test("golden path: sign up through Product Intelligence generation", async ({ page }) => {
  const unique = Date.now();
  const email = `smoketest-${unique}@example.com`;
  const workspaceName = `Detailer Co ${unique}`;
  const projectName = `Booking App ${unique}`;

  await page.goto("/");
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);

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
  await expect(page.getByRole("heading", { name: "Describe your product" })).toBeVisible();

  await page
    .getByPlaceholder("Describe your product idea...")
    .fill("Build a premium booking app for mobile detailers.");
  await page.getByRole("button", { name: "Send" }).click();

  // The idea was submitted, generateProductIntelligence ran (P1-06),
  // Truth Status was synced from a real Feasibility Report (P1-07), and
  // the Simple Mode page now renders it.
  await expect(page.getByRole("heading", { name: "Build a premium booking app" })).toBeVisible();
  await expect(page.getByText("For: mobile detailers")).toBeVisible();
  await expect(page.getByText("Trust", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Generated, working full-stack web application from Product State"),
  ).toBeVisible();
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Switch to Expert Mode" }).click();
  await expect(page).toHaveURL(/\/expert$/);
  await expect(page.getByText("Canonical Product State (1 version)")).toBeVisible();
  await expect(page.getByText("Decision Ledger")).toBeVisible();
  await expect(page.getByText("Event Ledger")).toBeVisible();
  await expect(page.getByText("PRODUCT_STATE_VERSION_CREATED")).toBeVisible();
});
