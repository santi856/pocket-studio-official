import { test, expect } from "@playwright/test";

/**
 * Master Spec §40: real PWA output — a manifest and a service worker that
 * actually registers in a real browser, not just declared server-side.
 */
test("PWA output: a real manifest and a registering service worker are served for a live preview", async ({
  page,
}) => {
  const unique = crypto.randomUUID();
  const email = `pwa-e2e-${unique}@example.com`;
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
    .fill("Build a premium booking app for mobile detailers.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Generate app" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);

  await page.getByRole("link", { name: "Preview: Home" }).click();
  await expect(page).toHaveURL(/\/preview\/Home$/);

  // The manifest link tag is present and points at a real, per-project route.
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toContain("manifest.webmanifest");

  const manifestResponse = await page.request.get(manifestHref!);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  expect(typeof manifest.name).toBe("string");
  expect(manifest.name.length).toBeGreaterThan(0);

  // The service worker actually registers in a real browser.
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.length > 0;
  });
});
