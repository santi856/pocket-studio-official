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
    // the race without needing a per-file database.
    fileParallelism: false,
  },
});
