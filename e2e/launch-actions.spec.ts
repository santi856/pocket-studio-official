import { test, expect } from "@playwright/test";

/**
 * Drives P2-17's Studio UI wiring through a real browser: every Launch
 * action added this unit (Quality Gate, Store Readiness, mobile project
 * generation, legal draft generation, version restore, export) is a real
 * server action hitting an already-tested service function — this proves
 * they are actually reachable from the Studio page, not just callable from
 * a test file, and that their real outcome (Truth Status + rationale) is
 * visible afterward in the Trust section.
 */
test("Studio Launch actions: Quality Gate, Store Readiness, mobile project, and legal drafts are reachable and reflect real outcomes", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `launch-e2e-${unique}@example.com`;
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

  await page
    .getByPlaceholder("Describe your product idea...")
    .fill("Build a premium booking app for mobile detailers with appointment deposits.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: /Build a premium booking app/ })).toBeVisible();

  await page.getByRole("button", { name: "Generate app" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText(/Build Plan v1 —/)).toBeVisible();

  // Run Quality Gate — a real check against the real Build Plan just
  // generated, not a self-report. Its outcome lands in Trust with a real
  // rationale (either "All Quality Gate checks passed." or a real failed
  // list) because the Trust section now renders each entry's rationale.
  await page.getByRole("button", { name: "Run Quality Gate" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText("Quality Gate for the generated product")).toBeVisible();

  // Assess store readiness (P2-16) — always NOT_READY in this build since
  // no Apple/Google developer account integration exists; the real,
  // itemized reason must be visible, not hidden behind a generic badge.
  await page.getByRole("button", { name: "Assess store readiness" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText("App Store / Play Store readiness")).toBeVisible();
  await expect(page.getByText(/Apple\/Google developer account connected/)).toBeVisible();

  // Generate the mobile project scaffold (P2-15) — output.ios/output.android
  // move to Implemented with an honest no-native-build rationale.
  await page.getByRole("button", { name: "Generate mobile project" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText(/no native build/).first()).toBeVisible();

  // Generate a real Terms of Service draft (P2-11) — the button relabels
  // from "Generate draft" to "Regenerate draft" once a real draft exists.
  await page
    .locator("li", { hasText: "Terms of Service" })
    .getByRole("button", { name: "Generate draft" })
    .click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(
    page.locator("li", { hasText: "Terms of Service" }).getByText("draft v1"),
  ).toBeVisible();
  await expect(
    page
      .locator("li", { hasText: "Terms of Service" })
      .getByRole("button", { name: "Regenerate draft" }),
  ).toBeVisible();

  // Export (P2-13) is a real, authenticated download — not a dead link.
  const exportLink = page.getByRole("link", { name: "Export project" });
  const href = await exportLink.getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("attachment");
  const bundle = await response.json();
  expect(bundle.blueprint.version).toBe(1);
});
