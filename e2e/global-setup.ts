import { execSync } from "node:child_process";

/**
 * Real incident, this codebase's own history: an unrelated dev server from
 * a different project was already listening on port 3000 (running for
 * days). playwright.config.ts's webServer.reuseExistingServer silently
 * treated that as "the server is up" and never started Pocket Studio's
 * own build — every one of 24 e2e tests then failed identically against
 * the wrong application, each with a confusing, unrelated error (missing
 * form fields, wrong redirect targets) rather than one clear "you're
 * testing the wrong app" signal. This checks the app's own identifiable
 * health response before any test runs, so that exact failure mode is
 * now a single loud, immediate error instead of 24 confusing ones.
 */
async function assertCorrectApplicationIsRunning(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  let response: Response;
  try {
    response = await fetch(`${baseURL}/api/health`);
  } catch (error) {
    throw new Error(
      `e2e global setup: could not reach ${baseURL}/api/health (${error instanceof Error ? error.message : String(error)}). ` +
        "Is the wrong process occupying this port, or is the app not actually up yet?",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `e2e global setup: ${baseURL}/api/health did not return JSON. ` +
        "This is almost certainly a different application occupying this port, not Pocket Studio's own server — check for a stale process (e.g. `lsof -i :3000`) before re-running.",
    );
  }

  const isPocketStudioHealthResponse =
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    "database" in body &&
    (body as { status: unknown }).status !== undefined;

  if (!isPocketStudioHealthResponse) {
    throw new Error(
      `e2e global setup: ${baseURL}/api/health responded, but not with Pocket Studio's expected {status, database} shape (got: ${JSON.stringify(body)}). ` +
        "A different application is very likely occupying this port — check for a stale process before re-running.",
    );
  }
}

/**
 * Runs once before the e2e suite starts. Without this, the app under test
 * boots against whatever the developer's database already happens to
 * contain — the Level 3 phase-exit review reproduced a real failure by
 * wiping the Docker volume and running the suite fresh: the Capability
 * Registry was empty, so every Feasibility assessment came back
 * "unrecognized" instead of the real "Planned" status, and the golden-path
 * assertion for it never became true. `npm run db:seed` already existed
 * (D-0015) but nothing ran it automatically before the suite — this closes
 * that gap so "the e2e suite passes" is true from a genuinely clean
 * environment, not just an already-seeded developer machine.
 */
export default async function globalSetup(): Promise<void> {
  await assertCorrectApplicationIsRunning();
  execSync("npm run db:seed", { stdio: "inherit" });
}
