try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional — CI injects vars directly.
}

import "@testing-library/jest-dom/vitest";
