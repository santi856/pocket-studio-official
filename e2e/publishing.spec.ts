import { test, expect } from "@playwright/test";

// Playwright test files run in their own Node process, separate from the
// `next start` process under test — process.env here is NOT pre-populated
// with .env the way Next.js's own runtime loads it automatically. Loaded
// before any dynamic import of @/lib/db below (a static top-level import
// would be hoisted above this call and read an empty environment first),
// mirroring prisma/seed.ts's own identical need.
try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional in CI, which injects vars directly.
}

/**
 * Publishing Milestone 1 (2026-07-27) — the critical end-to-end proof: a
 * customer generates a real app, publishes an explicit version, reaches it
 * at its public URL while signed out of Pocket Studio entirely, proves a
 * draft edit does NOT change what's live, publishes an update, unpublishes,
 * and restores.
 *
 * Every real organization starts on Free/Explore, which does not include
 * publishing (deploymentAllowed: false, seed-plans.ts) — and, per the
 * staging-readiness sprint's own finding, no paid plan has a real
 * configured price yet, so there is no live checkout path (mock or real)
 * to upgrade through the browser today. Rather than fabricate a price,
 * this test upgrades the org directly via Prisma — a disclosed, minimal
 * exception to this suite's black-box convention, justified because the
 * plan's own pricing/checkout mechanics are already covered elsewhere
 * (e2e/checkout-flow.spec.ts, subscription.integration.test.ts); what this
 * test exists to prove is the publish/rollback/tenant-isolation mechanism
 * itself, not billing.
 */
test("publish → visit publicly while signed out → draft edits don't leak → republish → unpublish → restore", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const unique = crypto.randomUUID();
  const email = `publish-e2e-${unique}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Publish Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correcthorsebatterystaple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Workspace name").fill(`Publish Co ${unique}`);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/org\/.+/);
  const orgSlug = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByPlaceholder("New project name").fill(`Booking App ${unique}`);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  const projectSlug = new URL(page.url()).pathname.split("/")[3]!;

  // See module doc comment: the only real gap this bypasses is "no plan has
  // a configured price yet", not anything about publishing itself.
  // Constructs the generated Prisma Client directly rather than importing
  // src/lib/db.ts — that module (correctly) imports the "server-only"
  // guard package, which throws unconditionally outside Next.js's own RSC
  // bundler (Playwright's Node process is neither that nor Vitest's
  // aliased-away stand-in, test/server-only-mock.ts).
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: orgSlug } });
  await prisma.organizationSubscription.update({
    where: { organizationId: organization.id },
    data: { planKey: "LAUNCH" },
  });
  await prisma.$disconnect();

  await page
    .getByPlaceholder("Describe your product idea...")
    .fill("Build a booking app with a database of customer records.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Nothing has been built for this product yet.")).toBeVisible();
  await page.getByRole("button", { name: "Generate app" }).click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/[^/]+$/);
  await expect(page.getByText(/Build Plan v1 —/)).toBeVisible();

  await page.getByRole("link", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/publish$/);
  await expect(page.getByText("Not published yet")).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/publish$/);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  const publicLink = page.getByRole("link", { name: /\/p\// });
  await expect(publicLink).toBeVisible();
  const publicUrl = await publicLink.getAttribute("href");
  expect(publicUrl).toBeTruthy();
  const publicSlug = new URL(publicUrl!).pathname.split("/")[2]!;

  // --- Reach it publicly, fully signed out of Pocket Studio ---
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(publicUrl!);
  await expect(publicPage).toHaveURL(new RegExp(`/p/${publicSlug}/sign-in$`));

  await publicPage.goto(`/p/${publicSlug}/sign-up`);
  await publicPage.getByLabel("Name").fill("Public Visitor");
  await publicPage.getByLabel("Email").fill(`public-visitor-${unique}@example.com`);
  await publicPage.getByLabel("Password").fill("correcthorsebatterystaple");
  await publicPage.getByRole("button", { name: "Create account" }).click();

  await expect(publicPage.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(publicPage.getByText("No Record records yet.")).toBeVisible();

  // --- A new generated version (a draft) must NOT change what the public
  // visitor sees until explicitly republished. Uses the existing
  // "Regenerate" action (real, already-e2e-tested elsewhere) to produce a
  // deterministic new Blueprint/Build Plan version pair, rather than
  // depending on the heuristic edit-classifier's non-deterministic
  // regeneration decision for an unrelated concern (publishing itself).
  await page.goto(`/org/${orgSlug}/${projectSlug}`);
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByText(/Build Plan v2 —/)).toBeVisible({ timeout: 15_000 });

  await publicPage.reload();
  await expect(publicPage.getByRole("heading", { name: "Home" })).toBeVisible();

  // --- Publish the update; the live version now changes ---
  await page.goto(`/org/${orgSlug}/${projectSlug}/publish`);
  await expect(page.getByText("You have unpublished changes")).toBeVisible();
  await page.getByRole("button", { name: "Publish update" }).click();
  await expect(page).toHaveURL(/\/publish$/);
  await expect(page.getByText(/Blueprint v2/)).toBeVisible();

  // --- Unpublish: the public URL stops serving the app ---
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page).toHaveURL(/\/publish$/);
  await expect(page.getByText("Unpublished", { exact: true })).toBeVisible();

  await publicPage.goto(publicUrl!);
  await expect(publicPage.locator("#__next_error__")).toHaveCount(0);
  await expect(publicPage.getByRole("heading", { name: "Home" })).toHaveCount(0);

  // --- Republish restores public access ---
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/\/publish$/);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();

  await publicPage.goto(publicUrl!);
  await expect(publicPage.getByRole("heading", { name: "Home" })).toBeVisible();

  await publicContext.close();
});
