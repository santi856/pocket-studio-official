# Phase 2 Exit Package

Assembled per Execution Protocol §16 and §11 (Readiness Reports: assembled from Evidence Ledger
records, Truth Status, the Decision Ledger, and test/build results — never written from narrative
confidence). This is the entry point for the Level 3 independent phase-exit reviewer (Review Protocol
§2). It is a factual index, not an argument for acceptance.

## Round 1 review outcome and fixes (read before re-reviewing)

An independent, fresh-context Level 3 reviewer already reviewed this phase once, against commit
`605e62d`. Verdict: **revise**. Full record: `execution/reviews/level3/phase-2/ROUND_1_REVIEW.md`.

Two CRITICAL DEFECTs, both live-reproduced against a real running instance (two real accounts/orgs/
projects, real HTTP traffic, not mocks):

1. A version-creation race condition: `createBlueprintVersion`/`createProductStateVersion`'s
   read-latest-then-create-next-version pattern is not serialized under Postgres's default READ
   COMMITTED isolation, so concurrent submissions (e.g. a double-clicked "Generate app") could crash to
   a raw Prisma `P2002` unique-constraint error instead of the graceful `?error=` redirect this
   codebase requires everywhere else. The reviewer noted this pattern is systemic, not confined to the
   two functions reproduced.
2. Every Server Action crashed to a raw error page on an expired/absent session instead of redirecting
   to sign-in, because no action caught `UnauthenticatedError` — the two P2-14 Route Handlers already
   did this correctly, the fix pattern just was never applied to any Server Action.

Plus two DEFECTs: the §56 demonstration-product content gap needed an explicit phase-exit-level
acknowledgment rather than D-0028's routine self-classification; `sw.js` was missing the same
auth/tenant gate its sibling `manifest.webmanifest` route has.

**All four were fixed in D-0040 (EV-0085)**, each critical fix adversarially self-verified by reverting
it, confirming a new regression test reproduces the reviewer's exact live failure, then restoring and
reconfirming green:

- `src/lib/db-versioning.ts`'s `createNextVersion()` adds a retry-with-jittered-backoff wrapper (up to
  20 attempts), applied to all 8 append-only versioned models sharing the racy pattern (Blueprint,
  BuildPlan, ProductState, ProductDNA, PolicyDocument, TruthStatusEntry, CapabilityRegistryEntry,
  PlanDefinition) — not just the two the reviewer reproduced. Verified: reverted the fix in
  `product-state.ts`, confirmed a new 10-concurrent-writer integration test
  (`product-state.integration.test.ts`) genuinely hits `P2002`, restored the fix, confirmed it now
  passes reliably across repeated runs.
- `requireCurrentUserForAction()` (`src/lib/web/require-user.ts`) — the same redirect-to-`/sign-in`
  shape already proven for pages (`requireUserForPage`) — replaces `requireCurrentUser()` across all 6
  `"use server"` action files. Verified: reverted the fix in `studio-actions.ts`, confirmed a new e2e
  test (`e2e/auth-guard.spec.ts`) genuinely reproduces the crash live in a browser after clearing the
  session cookie, restored the fix, confirmed it now passes.
- `D-0039` records the explicit, phase-exit-visible acknowledgment that the exact §56 demonstration
  sentence does not produce §56's full stated vision today.
- `sw.js` now carries the identical auth/tenant gate `manifest.webmanifest` already had.

Full validation suite after fixes: typecheck/lint/format clean, **382/382** unit+integration tests pass
(377 prior + 5 new), **12/12** e2e tests pass (11 prior + 1 new), production build succeeds (EV-0085).

Re-reviewer: please verify these fixes independently rather than trusting this summary, per the same
standard applied in round 1.

## Scope claim

Phase 2 — "Full-Stack Generation, Editing, Mobile Output, Business Operations, and Verification" — per
Master Spec §54-59. 17 implementation units (P2-01 through P2-17), plus 2 forward-committed additions
(a Phase 1 regression fix and the Product Pattern/Interaction Contract System foundation), on `main`,
starting immediately after the `phase-1-complete` checkpoint (commit `93571b6`):

| Commit    | Unit     | Subject                                                                           |
| --------- | -------- | --------------------------------------------------------------------------------- |
| `bd85110` | —        | Begin Phase 2: decomposition into P2-01..P2-17                                    |
| `70ad228` | P2-01    | Blueprint Engine — versioned, validated Blueprint model + deterministic generator |
| `fce585c` | —        | Phase 1 audit: fix ungraceful crash on double-responding to a decision            |
| `28e5cbc` | —        | Product Pattern and Interaction Contract System, wired into Blueprint Engine      |
| `0805474` | —        | Practical-product-completeness standard (D-0022); inference classification        |
| `d3a1176` | P2-02    | Component Registry — closed set of §26 UI primitives, safe-fail validation        |
| `617d778` | P2-03    | Build Planner — versioned Build Plan derived from a Blueprint                     |
| `64d1ffa` | P2-04    | Generated-app data layer — end-user identity + generic record store               |
| `8a17342` | P2-05    | Structured Renderer + Interactive Runtime                                         |
| `1fa3921` | P2-06    | Full-stack generation orchestration                                               |
| `9485534` | P2-07    | Demonstration product (Master Spec §56)                                           |
| `f6e7356` | P2-08    | Conversational editing, Change Sets, selective regeneration                       |
| `740449c` | P2-09    | Version history and restore                                                       |
| `4ce17f8` | P2-10    | Quality Gate for the generated product                                            |
| `a38ec29` | P2-11    | Security/privacy/governance impact + legal draft generation                       |
| `45f9b24` | P2-12    | Migration planning for generated-app data model changes                           |
| `5f93253` | P2-13    | Export foundation + durable jobs                                                  |
| `45c9c76` | P2-14    | Web and PWA output                                                                |
| `b86f266` | P2-15    | Mobile architecture + generated mobile project                                    |
| `e45d836` | P2-16/17 | Mobile-commerce classification + Store Readiness Engine; Studio UI wiring         |

## Master Spec §55 required capabilities → evidence

| Capability                                                                                    | Unit(s)                                                        | Evidence                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| Versioned Blueprint Engine                                                                    | P2-01                                                          | EV-0048, EV-0049                      |
| Build Planner                                                                                 | P2-03                                                          | EV-0055, EV-0056                      |
| Component Registry                                                                            | P2-02                                                          | EV-0053, EV-0054                      |
| Structured renderer + interactive runtime                                                     | P2-05                                                          | EV-0059, EV-0060                      |
| Supported frontend/backend/database generation                                                | P2-04, P2-06                                                   | EV-0057, EV-0058, EV-0061, EV-0062    |
| Authentication and authorization generation                                                   | P2-04                                                          | EV-0057, EV-0058                      |
| Business logic and administrative systems                                                     | P2-03, P2-06                                                   | EV-0055, EV-0061                      |
| Integration Requirements generation                                                           | P1-08 (reused), P2-11                                          | EV-0071, EV-0072                      |
| Supported payments/subscriptions architecture                                                 | P2-01, P2-16                                                   | EV-0048, EV-0081                      |
| Business-owner operation generation                                                           | P2-03                                                          | EV-0055                               |
| Conversational editing, Change Sets, dependency-aware Impact Analysis, selective regeneration | P2-08                                                          | EV-0065, EV-0066                      |
| Version history and restore                                                                   | P2-09                                                          | EV-0067, EV-0068                      |
| Quality Gate                                                                                  | P2-10                                                          | EV-0069, EV-0070                      |
| Unit/integration/authorization/tenant/accessibility/e2e tests                                 | all units                                                      | see full ledger; e2e: `e2e/*.spec.ts` |
| Security/privacy requirements, governance applicability and impact                            | P2-11                                                          | EV-0071, EV-0072                      |
| Legal and policy draft generation from actual state                                           | P2-11                                                          | EV-0071, EV-0072                      |
| Multilingual document-version tracking                                                        | P2-11 (PolicyDocument's `language` field, reused from Phase 1) | EV-0071                               |
| Migration planning                                                                            | P2-12                                                          | EV-0073, EV-0074                      |
| Preview environment                                                                           | P2-06                                                          | EV-0061, EV-0062                      |
| Export foundation                                                                             | P2-13                                                          | EV-0075, EV-0076                      |
| Durable jobs, retries, checkpoints, idempotency                                               | P2-13                                                          | EV-0075, EV-0076                      |
| Web and PWA output                                                                            | P2-14                                                          | EV-0077, EV-0078                      |
| Selected supported mobile architecture                                                        | P2-15                                                          | EV-0079, EV-0080                      |
| Generated mobile project                                                                      | P2-15                                                          | EV-0079, EV-0080                      |
| Supported mobile navigation, auth, backend connectivity, build validation                     | P2-15                                                          | EV-0079, EV-0080                      |
| Mobile-commerce classification and entitlement architecture                                   | P2-16                                                          | EV-0081, EV-0082                      |
| Store metadata and asset generation                                                           | P2-16 (partial — see Known limitations)                        | EV-0081, EV-0082                      |
| Store Readiness Engine                                                                        | P2-16                                                          | EV-0081, EV-0082                      |
| Platform-specific Truth Status                                                                | P2-14, P2-15, P2-16                                            | EV-0077, EV-0079, EV-0081             |
| Billing-restriction experience using test/local state                                         | Phase 1 (reused, not re-tested this phase)                     | EV-0035..EV-0038                      |

## Master Spec §59 exit criteria → evidence

**Pipeline: User Idea → Product Intelligence → Business Intelligence → Feasibility → Requirements →
Validated Blueprint → Build Plan → Generated Full-Stack Product → Interactive Runtime → Conversational
Edit → Impact Analysis → Change Set → Validation → Tests → Evidence → Version → Truth Status.**

Verified end to end, live in a real browser, by `e2e/golden-path.spec.ts` (Phase 1 portion),
`e2e/generation-preview.spec.ts` (Blueprint → Build Plan → generation → interactive preview),
`e2e/official-demonstration.spec.ts` (the exact §56 sentence), and the P2-08 conversational-edit
integration tests (`change-flow.integration.test.ts`, `change-set.integration.test.ts`) which drive
Impact Analysis → Change Set → validation → tests → evidence → version → Truth Status for a real edit.

| Requirement                                                                                   | Evidence                                                                                                                                |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Demonstration product renders                                                                 | EV-0061, EV-0062 (`e2e/generation-preview.spec.ts`)                                                                                     |
| Completes its primary customer workflow                                                       | EV-0063, EV-0064 (`e2e/official-demonstration.spec.ts`) — see Known limitations for the honest scope of "primary workflow" today        |
| Completes its primary business-owner workflow                                                 | Not separately demonstrated — see Known limitations                                                                                     |
| Persists supported data                                                                       | EV-0057, EV-0058 (GeneratedRecord, real Postgres writes)                                                                                |
| Represents payment and subscription behavior truthfully                                       | EV-0081, EV-0082 (Store Readiness honestly NOT_READY; no live payment execution exists anywhere in this build)                          |
| Accepts the required edit in §57                                                              | See "§57 required edit" section below                                                                                                   |
| Updates affected systems while preserving unrelated systems                                   | EV-0065, EV-0066 (D-0029's regression fix + regression test)                                                                            |
| Creates and restores versions                                                                 | EV-0067, EV-0068; reachable in the Studio UI via EV-0083                                                                                |
| Passes the Quality Gate                                                                       | EV-0069, EV-0070; reachable in the Studio UI via EV-0083                                                                                |
| Generates security, privacy, governance, and launch-readiness requirements                    | EV-0071, EV-0072, EV-0081, EV-0082                                                                                                      |
| Exports supported artifacts                                                                   | EV-0075, EV-0076; reachable in the Studio UI via EV-0083                                                                                |
| Generated mobile project, working supported runtime, build validation                         | EV-0079, EV-0080 — see Known limitations for "working supported runtime" scope                                                          |
| Navigation, backend connectivity, supported authentication (mobile)                           | EV-0079, EV-0080 — scaffold-level, see Known limitations                                                                                |
| Platform requirements, store metadata/asset requirements                                      | EV-0081, EV-0082 — see Known limitations (no asset generation)                                                                          |
| Platform-specific readiness status                                                            | EV-0077 (web/PWA), EV-0079 (iOS/Android build), EV-0081 (store readiness)                                                               |
| Typecheck, lint, unit, integration, e2e, tenant, accessibility, mobile-build validations pass | EV-0085 (last full-suite run after round 1 repairs: 382/382 unit+integration, 12/12 e2e, clean typecheck/lint/format, production build) |
| Independent Level 3 review accepts the phase                                                  | **Pending — this review**                                                                                                               |

### §56 demonstration product — honest current state

The exact required sentence ("Build a premium booking app for mobile detailers.") runs successfully
end to end (GENERATED, VALID, READY, live in a browser — EV-0063, EV-0064) but its actual deterministic
output today is the base Home/Browse screens with zero data models — far short of §56's full vision (11
customer screens, 11 owner screens, 11 data types: Services, Packages, Availability, Memberships, etc.).
This gap is intentionally **not** closed by hardcoding this one sentence's content, per Master Spec
§26's "not hardcoded preview screens" requirement — closing it honestly requires either a deliberately
expanded, reusable domain-template vocabulary or real AI-backed generation (Phase 3, §61). See
`official-demonstration.integration.test.ts`'s module comment for the full accounting. Consequently:
"completes its primary customer workflow" and "completes its primary business-owner workflow" are true
only for the actually-generated Home/Browse screens, not the full §56 booking/deposit/membership
workflow — this is the single largest honest gap between this exit package's evidence and §56/§59's
full stated vision, and is not being minimized here.

## §57 required edit — evidence

> "Add appointment deposits, monthly maintenance memberships, and recurring appointments."

Not run verbatim as this exact sentence in an end-to-end test. What **is** verified end to end
(`change-flow.integration.test.ts`, `change-set.integration.test.ts`, and the P2-08 e2e coverage) is
the full required mechanism §57 describes for a real edit request: intent resolution → Impact Analysis
identifying affected requirement categories → a real Change Set record → immediate application for
non-consequential changes or a held `PENDING` Change Set awaiting Decision approval for consequential
ones → selective regeneration only when categories actually changed → validation → a new Blueprint
version → Truth Status update → an explanation of what changed. Given §56's own honest gap (the
demonstration product does not yet generate the Packages/Memberships/Availability data models this
exact edit sentence references), running this literal sentence today would correctly resolve to the
`monetization` requirement category (deposits, memberships) via the same keyword-based Impact Analysis
verified elsewhere, but would not produce §56's fuller data model set for the same reason described
above. This is disclosed, not hidden.

## Full evidence and decision ledgers

- `execution/evidence/ledger.jsonl` — 85 records total; Phase 2's portion is EV-0048 through EV-0085
  (38 records), each with evidence type, verification method, result, and limitations.
- `execution/decisions/ledger.jsonl` — 40 records total; Phase 2's portion is D-0019 through D-0040
  (22 records), each with reason, alternatives considered, and impact.
- `execution/STATE.md` — human-readable narrative of what each unit built, for context only; the
  Evidence Ledger is the source of truth, not this narrative.

## Known limitations (truthful, current — see `execution/state.json`'s `knownLimitations` for the live copy)

The full, current list lives in `execution/state.json` to avoid two copies drifting apart. Highlights
most relevant to this review, beyond §56's gap already detailed above:

- Generation is deterministic/template-based throughout — never real AI reasoning — and every generated
  artifact discloses this via `generationMetadata`. Real AI-backed generation is Phase 3 scope (§61).
- The live preview route is gated by the platform's own session, not a separate unauthenticated
  end-user-facing route — `GeneratedAppUser` credential verification works but does not yet establish
  its own session/cookie.
- "Selective regeneration" (P2-08) is category-level, not screen/field-level.
- Version restore (P2-09) exists for Blueprint only, with no diff-preview step in the Studio UI (P2-17).
- The Quality Gate (P2-10) runs 8 real structural/server-side checks — no per-generation browser e2e run,
  no live authorization/tenant fuzzing (tenant isolation is structurally guaranteed by construction, not
  re-tested per invocation).
- Legal draft generation (P2-11) has real content generators for only 3 of 13 `PolicyDocumentType`
  values; no professional-review workflow exists.
- Migration planning (P2-12) is a standalone tool, not wired into `applyChangeSet`'s auto-apply path; no
  automated backup/snapshot mechanism exists for generated-app data.
- Export (P2-13) produces a structured JSON bundle only — no real code-file/deployment export. Durable
  jobs wrap only the GENERATION operation, with coarse-grained checkpointing.
- Web/PWA output (P2-14) has real installability mechanics but no Lighthouse-grade audit, no offline
  caching/push architecture.
- The generated mobile project (P2-15) is a static navigation-list scaffold — no mobile equivalent of
  the web Structured Renderer/Interactive Runtime exists. Build validation is TypeScript-syntax-only;
  never a real native `.ipa`/`.apk` build (no Xcode/Android SDK in this environment).
- Mobile-commerce classification (P2-16) is keyword-based, not language understanding; genuinely
  ambiguous ideas are honestly `unclassified`. Store Readiness `readinessStatus` can never report
  `READY` in this build — no Apple/Google developer account integration exists (Phase 3 scope).
- No dedicated "Operate" Studio surface exists (§6's sixth Simple Mode tab) — it describes production
  monitoring systems that don't exist yet (Phase 3 scope).
- Every Phase 1 known limitation not resolved by Phase 2's scope still applies (see
  `PHASE_1_COMPLETION_REPORT.md`).

## Required customer actions

None. Phase 2 requires no live credentials (AI, Stripe, Apple, Google) per Execution Protocol §8 — mock/
deterministic generation and honest `NOT_READY`/`NOT_EVALUATED` Truth Status satisfy every Phase 2 exit
criterion without them.

## Required external actions

None yet. Phase 3 will require: a real AI provider API key, Stripe/payment provider setup, Apple/Google
developer accounts, managed hosting/deployment infrastructure (§61-§66).

## Independence status

This review is being conducted by a fresh-context subagent per Review Protocol §2, spawned with the
three governance documents, repository access, and this evidence package — not the parent conversation's
history, self-justification, or reasoning.
