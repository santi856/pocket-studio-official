import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Underscore-prefixed params/vars are a deliberate "intentionally
      // unused" convention (e.g. unimplemented interface methods).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated/vendored code, not authored here:
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
    // Full git-worktree checkouts for background agent sessions
    // (including their own nested node_modules/src copies) — not this
    // repo's own source, and scanning them silently multiplied lint time
    // by however many worktrees happen to exist on disk.
    ".claude/**",
  ]),
]);

export default eslintConfig;
