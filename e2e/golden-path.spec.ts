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
  // Date.now() alone collides under rapid repeated runs (same millisecond);
  // crypto.randomUUID() guarantees a fresh identity every run.
  const unique = crypto.randomUUID();
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
  // Implemented, not Planned (P2-EXIT): Phase 2's real generation pipeline
  // (P2-01..P2-06) shipped and was independently reviewed, so the
  // Capability Registry entry now accurately reflects it as SUPPORTED_NOW
  // rather than the stale SUPPORTED_LATER_PHASE this test originally
  // asserted from Phase 1, before that capability existed.
  await expect(page.getByText("Implemented", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Switch to Expert Mode" }).click();
  await expect(page).toHaveURL(/\/expert$/);
  await expect(page.getByText("Canonical Product State (1 version)")).toBeVisible();
  await expect(page.getByText("Decision Ledger")).toBeVisible();
  await expect(page.getByText("Event Ledger")).toBeVisible();
  await expect(page.getByText("PRODUCT_STATE_VERSION_CREATED")).toBeVisible();

  // --- Back to Simple Mode: edit unit-economics assumptions (§20, §51 step 10) ---
  await page.getByRole("link", { name: "Switch to Simple Mode" }).click();
  await expect(page.getByLabel("Price")).toHaveAttribute("placeholder", "Unknown");
  await page.getByLabel("Price").fill("75");
  await page.getByRole("button", { name: "Save assumptions" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  // Next.js Server Action form submissions are a client-side (fetch-based)
  // transition, not a full document navigation — Playwright's automatic
  // "wait for navigation on click" does not apply here, so the network
  // must be explicitly settled before the next form interaction or a
  // .fill() can race the in-flight DOM swap and land on a stale node.
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Price")).toHaveValue("75");
  // A field never touched must survive the edit untouched (Master Spec §10's
  // "must not silently erase" principle applies to every edited artifact).
  await expect(page.getByLabel("Payment fees (%)")).toHaveValue("2.9");

  // --- Launch section reflects real Feasibility output, not invented data (§51 step 13) ---
  await expect(page.getByText("Output targets")).toBeVisible();
  await expect(page.getByText("web", { exact: true })).toBeVisible();

  const ideaBox = page.getByPlaceholder("Describe your product idea...");
  await expect(ideaBox).toBeEditable();
  await expect(ideaBox).toHaveValue("");

  // --- A monetization follow-up requires explicit approval (§15 CONSEQUENTIAL) ---
  await ideaBox.fill("Add appointment deposits and monthly memberships.");
  await expect(ideaBox).toHaveValue("Add appointment deposits and monthly memberships.");
  await page.getByRole("button", { name: "Send" }).click();
  // This round-trip runs the full beginChangeFlow pipeline (intent
  // resolution + impact analysis + decision recording, each a real DB
  // write) — allow more time than the default 5s under load.
  await expect(page.getByText("Needs your approval")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Change requested against an existing project.")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText("Needs your approval")).toBeHidden();

  // --- Returning later must not lose project state or repeat onboarding (§51 step 16) ---
  const projectUrl = page.url();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Sign in" }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(projectUrl);
  await expect(page.getByRole("heading", { name: "Build a premium booking app" })).toBeVisible();
  await expect(page.getByLabel("Price")).toHaveValue("75");
});
