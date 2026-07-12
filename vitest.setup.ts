try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional — CI injects vars directly.
}

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react's own auto-cleanup relies on detecting a global
// `afterEach` (vitest.config.ts does not set `test.globals: true`), so it
// never registers without this — every .tsx test file would otherwise leak
// its rendered DOM tree into the next test in the same file.
afterEach(cleanup);
