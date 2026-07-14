import { test, expect } from "@playwright/test";

/**
 * P3-03: real usage metering surfaced to the customer, not just enforced
 * silently server-side. A brand-new workspace is on Free/Explore
 * (projectLimit: 1) by default — after creating its one allowed project,
 * the billing page must show real usage (1 / 1), and creating a second
 * project must fail gracefully with the plan's real reason, not a crash.
 */
test("billing page shows real project usage against the plan limit, and the limit is enforced gracefully", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `billing-usage-e2e-${unique}@example.com`;
  const workspaceName = `Detailer Co ${unique}`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Jesse Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Workspace name").fill(workspaceName);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/org\/([^/]+)$/);
  const orgSlug = new URL(page.url()).pathname.split("/")[2];

  await page.getByPlaceholder("New project name").fill("First Project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);

  await page.goto(`/org/${orgSlug}/billing`);
  await expect(page.getByText("1 / 1")).toBeVisible();

  // Free/Explore's projectLimit (1) is already used — a second project is
  // gracefully rejected with the plan's real reason, not a crash.
  await page.goto(`/org/${orgSlug}`);
  await page.getByPlaceholder("New project name").fill("Second Project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/allows up to 1 project/)).toBeVisible();
});
