# Phase 2 Level 3 Review — Round 2

Conducted by a second independent, fresh-context subagent per Review Protocol §2, against commit
`6a6e393` (tag `phase-2-round-2-review-pending`). Verdict: **conditionally accept**.

Independently re-verified all four round 1 findings live (reverted each fix, confirmed the exact
failure reproduces, restored, reconfirmed) rather than trusting the round 1/repair summary: the
concurrency fix (stress-tested to 100 concurrent writers, beyond the team's own 10), the session-expiry
fix (against a second Server Action the round 1 regression test didn't cover), the §56 acknowledgment
(re-ran the official demonstration test directly), and the `sw.js` gate (live unauthenticated `curl`
against both `sw.js` and `manifest.webmanifest`, both `401`). Re-ran the entire validation suite from
its own execution, not trusted from the exit package. Performed a fresh Review Protocol §7 audit sample
distinct from round 1's (D-0018, D-0031, D-0033, D-0034) — no regression found.

## New finding (the reviewer's own adversarial pass, not a round 1 re-check)

**`startOrGetJobRun` (`src/lib/generation/job-runs.ts`) had the identical read-then-write race class
round 1 found and fixed elsewhere, but this instance was missed.** `findExistingJobRun` then
`db.jobRun.create()` against the unique `(projectId, jobType, idempotencyKey)` constraint, with no
transaction and no retry — two concurrent callers with the same `idempotencyKey` could both pass the
lookup before either committed, and the loser crashed with an uncaught `PrismaClientKnownRequestError`
(P2002). The reviewer reproduced this live, 5/5 runs. Not customer-reachable today (`runGenerationJob`/
`startOrGetJobRun` are not currently wired into any Server Action or route), so not a CRITICAL DEFECT
under Review Protocol §4 — but undisclosed, and the reviewer required it be either fixed or disclosed
before the phase-completion report is finalized.

## Final judgment (from the reviewer)

**Conditionally accept.** All four round 1 findings are independently, adversarially confirmed fixed.
Accepted on condition that the `job-runs.ts` race is (1) recorded in known limitations and (2) fixed
with the same proven retry pattern before ever wired into a live route.

## Resolution

Both conditions satisfied immediately, before finalizing the completion report, rather than deferring
either: `startOrGetJobRun` now catches the exact `P2002` conflict on its `create()` call and re-fetches
the winner's row instead of crashing — the correct idempotency semantics (defer to the existing row,
never retry-create against a fixed identity key, unlike a version number). Adversarially self-verified
the same way as every other fix this phase: reverted, confirmed a new 10-concurrent-caller regression
test (`job-runs.integration.test.ts`) reproduces the exact live P2002 crash, restored, reconfirmed
green. Full suite after this fix: 383/383 unit+integration (one more than round 1's repair), 12/12 e2e,
clean typecheck/lint/format, production build. See `D-0041`, `EV-0086`.
