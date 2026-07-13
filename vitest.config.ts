import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./test/server-only-mock.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    // Integration tests share one real Postgres test database and each
    // resets it in beforeEach. Running test *files* in parallel lets one
    // file's reset wipe rows another file's test just created (observed:
    // spurious foreign-key violations). Sequential file execution avoids
    // the race without needing a per-file database. Confirmed (P2-EXIT
    // practical-completeness audit): `fileParallelism: false` already
    // forces Vitest's own `maxWorkers` to 1 — the strongest single-process
    // guarantee this Vitest version exposes (the `poolOptions.forks.
    // singleFork` option from older Vitest majors does not exist in this
    // version's config schema). A real, reproducible run of cross-file data
    // collisions was observed and root-caused this session to stale
    // Postgres connections left by an abruptly killed (`kill -9`)
    // manually-started dev server during debugging, not a gap in this
    // setting or a defect in application logic — every individual file,
    // and the full e2e suite, stayed reliably green throughout, and 3
    // consecutive full clean runs (425/425 each) confirmed stability once
    // the stale connections cleared. See execution/audits/
    // TEST_AND_EVIDENCE_AUDIT.md and EV-0092.
    fileParallelism: false,
  },
});
