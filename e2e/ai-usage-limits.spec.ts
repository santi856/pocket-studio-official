import { test, expect } from "@playwright/test";

/**
 * Production-safe AI usage controls (Master Spec — staging-readiness
 * sprint follow-up, 2026-07-26): abuse protection on idea/edit submission
 * (src/lib/orchestration/submission-rate-limit.ts, wired into
 * submitIdeaAction, src/lib/actions/studio-actions.ts). This drives the
 * real default limit (AI_SUBMISSION_RATE_LIMIT_MAX_ATTEMPTS=20 per
 * AI_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS=60, src/lib/env.ts) through an
 * actual signed-in browser session — proving the graceful-failure UX
 * (a clear message, the customer's exact text preserved) really happens
 * at the HTTP/Server Action boundary, not just at the function level
 * (already covered by submission-rate-limit.integration.test.ts).
 */
test("submitting more ideas/edits than the configured rate limit fails gracefully, preserving the last attempted text", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const unique = crypto.randomUUID();
  const email = `rate-limit-e2e-${unique}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Rate Limit Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Workspace name").fill(`Rate Limit Co ${unique}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/org\/.+/);
  await page.getByPlaceholder("New project name").fill("Rate Limit Project");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);

  const ideaBox = page.getByPlaceholder("Describe your product idea...");

  // The first submission establishes real product state (describe_idea);
  // every submission after is a benign, non-consequential edit_request —
  // plain UI-copy tweaks are never classified as needing approval, so
  // this loop runs uninterrupted up to the real configured limit.
  await ideaBox.fill("Build a scheduling app for mobile pet groomers.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForLoadState("networkidle");

  // 1 (above) + 19 more = 20 total, exactly at the default limit.
  for (let i = 0; i < 19; i++) {
    await ideaBox.fill(`Rename the submit button to label variant ${i}.`);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForLoadState("networkidle");
  }
  await expect(page.getByText("Too many submissions.")).toHaveCount(0);

  // The 21st submission (1 initial + 20 more) exceeds the limit.
  const finalAttemptText = "This exact text must survive the rate-limit redirect.";
  await ideaBox.fill(finalAttemptText);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("Too many submissions. Please wait a moment before trying again."),
  ).toBeVisible();
  await expect(ideaBox).toHaveValue(finalAttemptText);
  await expect(page.locator("#__next_error__")).toHaveCount(0);
});
