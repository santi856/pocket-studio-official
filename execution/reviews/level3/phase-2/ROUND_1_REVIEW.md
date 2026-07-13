# Phase 2 Level 3 Review — Round 1

Conducted by an independent, fresh-context subagent per Review Protocol §2, against commit `605e62d`
(tag `phase-2-review-pending`). Verdict: **revise**.

Full independent-verification summary: the reviewer re-ran the entire validation suite itself
(typecheck/lint/format/377 unit+integration/production build/11 e2e) and confirmed the Exit Package's
claims accurate, live-drove the application with real HTTP traffic across two real accounts/orgs/
projects (not mocks), and performed the Review Protocol §7 audit sample (D-0020, D-0029, D-0033 —
all three fixes confirmed still in place, no regression).

## Findings (verbatim from the reviewer)

1. **CRITICAL DEFECT — the Generate/Regenerate action crashes to a raw, unbranded error page under
   ordinary double-click concurrency.** Concurrent submissions of `generateApplicationAction` reliably
   produce an uncaught `PrismaClientKnownRequestError` (`P2002` unique constraint on
   `(projectId, version)`) that propagates to a raw 500, not the graceful `?error=` redirect this
   codebase established as mandatory (D-0018, D-0020). Root cause: `createBlueprintVersion` and
   `createProductStateVersion` both do `findFirst(order by version desc)` then
   `create({version: latest+1})` inside a `$transaction`, which does not prevent the race under
   Postgres's default READ COMMITTED isolation — a systemic pattern across every append-only versioned
   model. P2-13's tested `runGenerationJob`/`JobRun` wrapper exists specifically for this operation but
   `generateApplicationAction` bypasses it entirely. Not disclosed as a known limitation. **Blocking.**
2. **CRITICAL-adjacent DEFECT — every Server Action crashes to a raw error page on an expired/absent
   session** instead of redirecting to sign-in. Reproduced against `generateApplicationAction`,
   `submitIdeaAction`, `createProjectAction` with no session cookie: all three throw an uncaught
   `UnauthenticatedError` → raw 500. Fails closed (no unauthorized action executes) but is a systemic,
   ordinary-use failure. The two P2-14 route handlers already catch this correctly — the fix pattern is
   known, just never applied to any Server Action. **Blocking.**
3. **DEFECT — §56/§59's core exit criteria are not actually met for the required demonstration
   product.** Running the exact required sentence produces only Home/Browse with zero data models — an
   already-disclosed gap in the Exit Package, but the reviewer notes §58's deferred list does not
   include "the demonstration product's own content," and the decision to accept this gap (D-0028) was
   self-classified by the implementer as routine rather than surfaced to this review. Recommends either
   an explicit Decision Ledger entry acknowledging the gap and its rationale, or closing it before
   re-review.
4. **DEFECT (low severity) — `sw.js` has no authentication or tenant checks**, contradicting its own
   code comment, which claims parity with `manifest.webmanifest` (which is correctly gated).

Non-blocking: unit-economics input has no sanity bounds and silently drops invalid input with no
customer-visible error (IMPROVEMENT, deferred).

## Final judgment

**Revise.** Two critical, systemic, live-reproduced crash defects on the phase's most central customer
actions, neither caught by the existing 377 unit/integration or 11 e2e tests (none of which exercise
concurrency or expired sessions). Per Review Protocol §4/§5, a broken primary workflow is a CRITICAL
DEFECT and unresolved critical defects may never be accepted. The reviewer explicitly characterizes
this as "a repair-and-re-verify situation (Review Protocol §9), not a rebuild" — the engineering culture
and architecture are assessed as sound; the defects are narrow and well-understood.
