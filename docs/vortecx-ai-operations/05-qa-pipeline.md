# QA Pipeline

## The three tiers already proven in this repository

Pocket Studio's Review Protocol (`docs/POCKET_STUDIO_OFFICIAL_REVIEW_PROTOCOL_v1.0.md`) defines three review tiers. This session used all three in practice, not just on paper:

1. **Level 1 — implementation-unit review.** Run after each coherent change. This session: after the generated-app-user auth/session feature and again after the account-deletion flow, before either was committed.
2. **Level 2 — milestone review.** Run after a complete customer workflow. Not separately invoked this session (the work fell under Level 1/Level 3 scope), but defined and available.
3. **Level 3 — phase-exit adversarial review, independence enforced mechanically.** A fresh-context subagent, given only governance docs + repo state + evidence — never the implementer's reasoning. This session: the Stage 3 Level 3 review (`execution/reviews/level3/stage-3/ROUND_1_REVIEW.md`), verdict ACCEPT with deferred improvements, zero critical defects, including a real §7 audit sample of three prior findings re-verified against current behavior.

## Automated test layers, current counts (verified this session)

| Layer | Tool | Count | Notes |
|---|---|---|---|
| Unit + integration | Vitest | 108 files / 808 tests | Run via `npm test`; part of `npm run validate` |
| End-to-end | Playwright | 14 test files | Run via `npm run test:e2e`; **not** part of `npm run validate` — not run on every change by default |
| Static tenant-isolation analysis | Custom AST scanner (`src/lib/tenancy/verify-tenant-isolation.ts`) | scans every non-test `.ts` under `src/lib` on every run | A genuinely novel QA mechanism: mechanically enforces that every tenant-scoped function reaches a recognized authorization root or is in a small, individually-justified exception list. Extended twice this session (once for the generated-app session domain, once for its cookie helpers) and re-verified clean both times. |

## Live browser verification (Claude in Chrome)

Proven this session for two distinct purposes:

- **Feature verification**: sign-up → session → protected screen → sign-out (verified via blocked direct URL access, not just a UI state change) → sign-back-in, for the generated-app-user auth feature.
- **Full acceptance-test execution**: the complete Master Spec §67 journey against a brand-new account, culminating in `execution/final-audit/OFFICIAL_V1_ACCEPTANCE_TEST_EXECUTION_REPORT.md`.

Standing rule, already practiced: **never mark a task complete from code inspection or a passing test suite alone** when the change has a live, user-facing surface — drive it in a real browser first.

## Proposed additions — PROPOSED FUTURE STANDARD

- **CI-enforced test gate**: add the missing GitHub Actions workflow (see `04-development-pipeline.md`) so unit/integration tests, typecheck, lint, and format block merge automatically, rather than relying on the pipeline being run manually and honestly every time.
- **e2e-in-CI**: promote Playwright's 14 e2e tests from "exists but must be remembered to run" to an automated, scheduled or merge-triggered job.
- **Coolify staging verification**: once staging exists, re-run Claude-in-Chrome verification against the deployed staging URL, not only local dev — catches environment-specific defects (env vars, build differences) that local-only testing cannot.

## What this session's own findings say about QA maturity

The Official V1 Acceptance Test execution report recorded two real findings (a Blueprint-restore/regenerate interaction gap, and an unresolved viewport-emulation tooling limitation) rather than a clean pass — this is the intended outcome of the discipline above, not a failure of it. A QA process that never finds anything is more likely under-verifying than genuinely clean.
