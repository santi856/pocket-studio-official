import { test, expect } from "@playwright/test";

/**
 * Regression test for a Level 3 phase-exit review finding
 * (execution/reviews/level3/phase-1/): createProjectAction did not catch
 * ForbiddenError, so a forged `organizationSlug` pointing at a real
 * organization the caller isn't a member of crashed with Next.js's raw
 * error page instead of failing gracefully. The underlying tenant
 * isolation always held (no cross-tenant row was ever created — verified
 * at the service layer in product-state.integration.test.ts and
 * authz.integration.test.ts) — this test locks in the *graceful failure*
 * behavior at the HTTP boundary, which those service-level tests cannot
 * reach.
 */
test("a forged organizationSlug on project creation fails gracefully, not with a crash page", async ({
  browser,
}) => {
  const unique = crypto.randomUUID();

  // Account A creates its own organization.
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto("/sign-up");
  await pageA.getByLabel("Name").fill("Owner A");
  await pageA.getByLabel("Email").fill(`a-${unique}@example.com`);
  await pageA.getByLabel("Password").fill("correcthorsebatterystaple");
  await pageA.getByRole("button", { name: "Create account" }).click();
  await pageA.getByLabel("Workspace name").fill(`Org A ${unique}`);
  await pageA.getByRole("button", { name: "Continue" }).click();
  await expect(pageA).toHaveURL(/\/org\/.+/);

  // Account B creates a separate organization that A is not a member of.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto("/sign-up");
  await pageB.getByLabel("Name").fill("Owner B");
  await pageB.getByLabel("Email").fill(`b-${unique}@example.com`);
  await pageB.getByLabel("Password").fill("correcthorsebatterystaple");
  await pageB.getByRole("button", { name: "Create account" }).click();
  await pageB.getByLabel("Workspace name").fill(`Org B ${unique}`);
  await pageB.getByRole("button", { name: "Continue" }).click();
  await expect(pageB).toHaveURL(/\/org\/.+/);
  const orgBSlug = new URL(pageB.url()).pathname.split("/")[2];

  // As A, forge the hidden organizationSlug field to point at B's org.
  await pageA.evaluate((forgedSlug) => {
    const input = document.querySelector<HTMLInputElement>('input[name="organizationSlug"]');
    if (input) input.value = forgedSlug as string;
  }, orgBSlug);
  await pageA.getByPlaceholder("New project name").fill("Hostile Project");
  await pageA.getByRole("button", { name: "Create" }).click();

  // Must redirect gracefully (to /dashboard), never Next.js's raw crash page.
  await expect(pageA).toHaveURL(/\/dashboard$/);
  await expect(pageA.locator("#__next_error__")).toHaveCount(0);

  // No project was created in B's organization.
  await pageB.reload();
  await expect(pageB.getByText("No projects yet.")).toBeVisible();

  await contextA.close();
  await contextB.close();
});
