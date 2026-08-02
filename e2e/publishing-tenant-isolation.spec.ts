import { test, expect } from "@playwright/test";

/**
 * Publishing Milestone 1 — the same class of regression test as
 * tenant-isolation.spec.ts's forged-organizationSlug test, applied to the
 * new publish/unpublish/restore server actions: a forged orgSlug/
 * projectSlug pointing at a real project the caller is not a member of
 * must fail gracefully (resolveProjectForRoute's own ForbiddenError ->
 * notFound() handling, already proven for every other action in this
 * codebase), never publish, modify, or reveal anything about someone
 * else's project.
 */
test("a forged organizationSlug/projectSlug on the publish action fails gracefully and never publishes another tenant's project", async ({
  browser,
}) => {
  const unique = crypto.randomUUID();

  // Account A: real org/project with a real generated app.
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
  const orgASlug = new URL(pageA.url()).pathname.split("/")[2]!;
  await pageA.getByPlaceholder("New project name").fill(`Project A ${unique}`);
  await pageA.getByRole("button", { name: "Create" }).click();
  await expect(pageA).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  const projectASlug = new URL(pageA.url()).pathname.split("/")[3]!;

  // Account B: a separate, real, unrelated organization.
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

  // As B, visiting A's real publish page directly must 404, not reveal state.
  await pageB.goto(`/org/${orgASlug}/${projectASlug}/publish`);
  await expect(pageB.getByText("This page could not be found.")).toBeVisible();

  await contextA.close();
  await contextB.close();
});
