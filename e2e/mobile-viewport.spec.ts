import { test, expect } from "@playwright/test";

/**
 * Real mobile viewport verification (Master Spec §67's acceptance-test
 * criterion) — runs under Playwright's "mobile" project (playwright.config.ts,
 * devices["Pixel 5"]: a real 393x727 viewport, mobile user-agent, and touch
 * input), not a browser-window resize. A prior manual browser-automation
 * session found that resizing an actual Chrome window did not reliably
 * change the page's own rendered viewport in that environment — this test
 * exists so mobile rendering is verified by a mechanism that actually works,
 * not re-asserted by the same unreliable one. A Chromium-based device was
 * chosen deliberately over an iPhone/WebKit device after investigating a
 * real WebKit-specific finding (see playwright.config.ts's own comment on
 * the "mobile" project) unrelated to mobile-viewport rendering itself.
 *
 * Drives real interaction, not just a visual/layout check: the landing page
 * must render without horizontal overflow, and the same sign-up →
 * project → idea → generation flow golden-path.spec.ts proves on desktop
 * must also complete successfully at mobile viewport width and with touch
 * taps instead of mouse clicks.
 */
test("mobile viewport: landing page has no horizontal overflow and the golden path completes with touch taps", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `mobile-e2e-${unique}@example.com`;
  const workspaceName = `Mobile Detailer Co ${unique}`;
  const projectName = `Mobile Booking App ${unique}`;

  await page.goto("/");

  // A horizontally-scrollable landing page on a real mobile viewport is a
  // genuine, common mobile-usability defect (an element wider than the
  // viewport, not a design choice) — checked directly, not assumed absent.
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await expect(page.getByRole("heading", { name: "Describe the product" })).toBeVisible();

  await page.getByRole("link", { name: "Get started" }).tap();
  await expect(page).toHaveURL(/\/sign-up$/);

  await page.getByLabel("Name").tap();
  await page.getByLabel("Name").fill("Mobile Test");
  await page.getByLabel("Email").tap();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").tap();
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).tap();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Workspace name").fill(workspaceName);
  await page.getByRole("button", { name: "Continue" }).tap();

  await expect(page).toHaveURL(/\/org\/.+/);
  await page.getByPlaceholder("New project name").fill(projectName);
  await page.getByRole("button", { name: "Create" }).tap();

  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Describe your product" })).toBeVisible();

  await page
    .getByPlaceholder("Describe your product idea...")
    .fill("Build a premium booking app for mobile detailers.");
  await page.getByRole("button", { name: "Send" }).tap();

  await expect(page.getByRole("heading", { name: "Build a premium booking app" })).toBeVisible();
  await expect(page.getByText("Trust", { exact: true })).toBeVisible();

  const studioHasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(studioHasHorizontalOverflow).toBe(false);
});
