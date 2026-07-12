import { test, expect } from "@playwright/test";

/**
 * Regression test for a behavioral-completeness defect found in a Phase 1
 * audit: respondToDecisionAction had no handling for
 * DecisionNotPendingError, so a decision responded to twice (e.g. two
 * browser tabs open on the same pending decision, or a double-click racing
 * a slow connection) crashed with Next.js's raw error page instead of
 * failing gracefully — the same bug class already fixed once for
 * createProjectAction (D-0018) but left unguarded here. The service layer
 * (respondToDecision) always correctly rejected the second response; only
 * the Server Action wrapping it was missing the try/catch.
 *
 * Reproduces deterministically with two tabs sharing one session, rather
 * than racing two submits against a timing window.
 */
test("responding to an already-answered decision from a second tab redirects gracefully, not a crash page", async ({
  browser,
}) => {
  const unique = crypto.randomUUID();
  const context = await browser.newContext();
  const tabOne = await context.newPage();

  await tabOne.goto("/sign-up");
  await tabOne.getByLabel("Name").fill("Owner");
  await tabOne.getByLabel("Email").fill(`decision-${unique}@example.com`);
  await tabOne.getByLabel("Password").fill("correcthorsebatterystaple");
  await tabOne.getByRole("button", { name: "Create account" }).click();
  await tabOne.getByLabel("Workspace name").fill(`Decision Co ${unique}`);
  await tabOne.getByRole("button", { name: "Continue" }).click();
  await expect(tabOne).toHaveURL(/\/org\/.+/);

  await tabOne.getByPlaceholder("New project name").fill(`Booking App ${unique}`);
  await tabOne.getByRole("button", { name: "Create" }).click();
  await expect(tabOne).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  const projectUrl = tabOne.url();

  const ideaBox = tabOne.getByPlaceholder("Describe your product idea...");
  await ideaBox.fill("Build a premium booking app for mobile detailers.");
  await tabOne.getByRole("button", { name: "Send" }).click();
  await expect(tabOne).toHaveURL(projectUrl);

  await ideaBox.fill("Add appointment deposits and monthly memberships.");
  await tabOne.getByRole("button", { name: "Send" }).click();
  await expect(tabOne.getByText("Needs your approval")).toBeVisible({ timeout: 15_000 });

  // A second tab, same session, opens the same pending-decision page.
  const tabTwo = await context.newPage();
  await tabTwo.goto(projectUrl);
  await expect(tabTwo.getByText("Needs your approval")).toBeVisible();

  // Tab one approves first.
  await tabOne.getByRole("button", { name: "Approve" }).click();
  await expect(tabOne.getByText("Needs your approval")).toBeHidden();

  // Tab two, unaware, submits its still-stale Approve form for the same
  // decision. Must redirect gracefully back to the Studio page with an
  // explanatory error, never Next.js's raw crash page.
  await tabTwo.getByRole("button", { name: "Approve" }).click();
  await expect(tabTwo).toHaveURL(new RegExp(`${projectUrl.split("?")[0]}\\?error=`));
  await expect(tabTwo.getByText("This decision was already responded to.")).toBeVisible();
  await expect(tabTwo.locator("#__next_error__")).toHaveCount(0);

  await context.close();
});
