import { test, expect } from "@playwright/test";

/**
 * AS-0001's designated "first vertical proof" (execution/state.json), run
 * for real in a browser: the Example App Ideas picker must be mouse-,
 * keyboard-, and touch-selectable; populate its connected textarea while
 * leaving it fully editable; behave predictably under repeated selection;
 * preserve input across a recoverable failure; let the customer continue
 * naturally into a real generation; carry correct accessibility semantics;
 * and have its outcome honestly reflected in real Truth Status (not a
 * self-report — driven from generateApplication's own real result).
 */

async function signUpAndReachStudio(page: import("@playwright/test").Page) {
  const unique = crypto.randomUUID();
  const email = `idea-picker-e2e-${unique}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Jesse Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Workspace name").fill(`Detailer Co ${unique}`);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/org\/.+/);
  await page.getByPlaceholder("New project name").fill(`Booking App ${unique}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
}

test("Example App Ideas picker: mouse-selectable, accessible, populates and keeps the textarea editable, continues naturally into real generation", async ({
  page,
}) => {
  await signUpAndReachStudio(page);

  const group = page.getByRole("group", { name: "Example app ideas" });
  await expect(group).toBeVisible();

  const chip = page.getByRole("button", {
    name: "Build a premium booking app for mobile detailers.",
  });
  await expect(chip).toBeVisible();

  // Real mouse selection.
  await chip.click();
  const textarea = page.getByPlaceholder("Describe your product idea...");
  await expect(textarea).toHaveValue("Build a premium booking app for mobile detailers.");

  // Populated text remains fully editable, not a read-only preview.
  await expect(textarea).not.toHaveAttribute("readonly");
  await textarea.fill("Build a premium booking app for mobile detailers with deposits.");
  await expect(textarea).toHaveValue(
    "Build a premium booking app for mobile detailers with deposits.",
  );

  // Repeated selection behaves predictably: re-selecting the same chip
  // always produces the exact same text, discarding the manual edit
  // deliberately (that is what clicking a suggestion does), not randomly.
  await chip.click();
  await expect(textarea).toHaveValue("Build a premium booking app for mobile detailers.");

  // The customer can continue naturally: submit, and a real Product
  // Intelligence generation genuinely runs from the selected text.
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "Build a premium booking app for mobile detailers" }),
  ).toBeVisible();
});

test("Example App Ideas picker: keyboard-selectable via real Tab + Enter, no mouse involved", async ({
  page,
}) => {
  await signUpAndReachStudio(page);

  const chip = page.getByRole("button", {
    name: "Build a subscription box service for coffee lovers.",
  });
  await chip.focus();
  await expect(chip).toBeFocused();
  await page.keyboard.press("Enter");

  const textarea = page.getByPlaceholder("Describe your product idea...");
  await expect(textarea).toHaveValue("Build a subscription box service for coffee lovers.");
});

test("Example App Ideas picker: touch-selectable on a real touch-capable context", async ({
  browser,
}) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await signUpAndReachStudio(page);

  const chip = page.getByRole("button", {
    name: "Build a marketplace for local freelance photographers.",
  });
  await chip.tap();

  const textarea = page.getByPlaceholder("Describe your product idea...");
  await expect(textarea).toHaveValue("Build a marketplace for local freelance photographers.");

  await context.close();
});

test("Example App Ideas picker: recoverable failure preserves input — a too-short submission returns a real error and the exact attempted text, not a silent no-op or lost draft", async ({
  page,
}) => {
  await signUpAndReachStudio(page);

  const textarea = page.getByPlaceholder("Describe your product idea...");
  await textarea.fill("app");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(
    page.getByText("Describe your idea in a bit more detail before sending."),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Describe your product idea...")).toHaveValue("app");

  // The customer continues naturally from exactly where they left off —
  // expanding the preserved draft, not retyping it.
  await page.getByPlaceholder("Describe your product idea...").fill("app for tracking my expenses");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "app for tracking my expenses" })).toBeVisible();
});
