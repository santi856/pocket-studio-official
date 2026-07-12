import { test, expect } from "@playwright/test";

/**
 * Drives the P2-06 full-stack generation orchestration through a real
 * browser: describe an idea → Generate app → follow a real Preview link →
 * land on a live route that renders a Structured Renderer (P2-05) tree
 * bound to real generated-app data (P2-04) via the current Build Plan
 * (P2-03) — not a hardcoded preview screen (Master Spec §25/§26).
 */
test("generation: Generate app produces a real Build Plan and a live, data-bound preview screen", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `gen-e2e-${unique}@example.com`;
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
    .fill("Build a booking app with a database of customer records.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Build a booking app" })).toBeVisible();

  await expect(page.getByText("Nothing has been built for this product yet.")).toBeVisible();
  await page.getByRole("button", { name: "Generate app" }).click();

  // generateApplication ran (Blueprint v1 + Build Plan v1), redirected back
  // to the Studio page, which now shows the real Build Plan status and a
  // real link per screen the Build Plan actually produced.
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText(/Build Plan v1 —/)).toBeVisible();
  const previewLink = page.getByRole("link", { name: "Preview: Home" });
  await expect(previewLink).toBeVisible();

  await previewLink.click();
  await expect(page).toHaveURL(/\/preview\/Home$/);

  // Real DOM interpreted from the Build Plan's componentStructure, not a
  // static image or fixed marketing copy.
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  // The List's own screen-data-binding (screen-data-binding.ts) ran a real
  // database query for the "Record" data model and found none — an honest
  // EmptyState, not a hardcoded placeholder list.
  await expect(page.getByText("No Record records yet.")).toBeVisible();

  await page.getByRole("link", { name: "Back to Studio" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
});
