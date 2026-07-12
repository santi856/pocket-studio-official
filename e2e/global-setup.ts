import { execSync } from "node:child_process";

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
export default function globalSetup(): void {
  execSync("npm run db:seed", { stdio: "inherit" });
}
