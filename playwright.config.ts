import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile-viewport\.spec\.ts/,
    },
    // Real device-emulated mobile viewport (Master Spec §67's "real mobile
    // viewport" acceptance criterion) — deliberately scoped to its own
    // spec file via testMatch rather than re-running the entire desktop
    // suite a second time under a different viewport, which would double
    // suite runtime for no new coverage the desktop project doesn't
    // already provide behaviorally.
    //
    // Chromium-based device (Pixel 5), not an iPhone/WebKit device:
    // investigated directly and confirmed this app's session cookie
    // (Secure-flagged in production mode, src/lib/auth/cookies.ts) is
    // never stored by WebKit at all when served over plain http://localhost
    // — WebKit does not grant the same "treat localhost as a secure
    // context" exception Chromium does for Secure cookies. This is a real,
    // disclosed consideration for eventual production deployment (verify
    // HTTPS is enforced everywhere, including staging, so a real Safari
    // user is never silently signed out) — not a Pocket Studio code defect
    // to weaken the Secure flag for, and not something a local http-only
    // test server can validate either way. Pixel 5 verifies genuine mobile
    // viewport dimensions and touch interaction without that unrelated
    // HTTP/HTTPS artifact.
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile-viewport\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
