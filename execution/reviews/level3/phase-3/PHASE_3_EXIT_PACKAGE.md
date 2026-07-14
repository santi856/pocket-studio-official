# Phase 3 Exit Package

Assembled per Execution Protocol §16 and §11 (Readiness Reports: assembled from Evidence Ledger
records, Truth Status, the Decision Ledger, and test/build results — never written from narrative
confidence). This is the entry point for the Level 3 independent phase-exit reviewer (Review Protocol
§2). It is a factual index, not an argument for acceptance.

## Scope claim

Phase 3 — "Commercial Production, Billing, Deployment, Mobile Distribution, Governance Monitoring, and
Operations" — per Master Spec §60-§66. 14 implementation units (P3-01 through P3-14) plus one
mid-phase, user-directed regression repair (P3-02 regression repair, D-0053), on `main`, starting
immediately after the `phase-2-complete` checkpoint (commit `e96617e`):

| Commit    | Unit                    | Subject                                                                 | Decision | Evidence |
| --------- | ------------------------ | ------------------------------------------------------------------------ | -------- | -------- |
| `ad14d95` | P3-01                    | Real AI provider connection (Anthropic)                                  | D-0047   | EV-0092  |
| `639c429` | P3-02                    | Production database/auth hardening + tenant-isolation/migration tooling  | D-0048   | EV-0093  |
| `d045272` | P3-03                    | Plans, entitlements, usage metering, limits and overages                 | D-0049   | EV-0094  |
| `e6d7a70` | P3-04                    | Production billing — portal, verified webhooks, reconciliation           | D-0050   | EV-0095  |
| `9ffdd96` | P3-05                    | Customer-owned infrastructure protection + integration OAuth             | D-0051   | EV-0096  |
| `922aec1` | P3-06                    | Customer-owned generated-app payment and subscription connections        | D-0052   | EV-0097  |
| `ec7cd2e` | P3-02 regression repair  | User-directed review: 5 real defects fixed in the sign-in rate limiter   | D-0053   | EV-0098  |
| `85db50b` | P3-07                    | Production email                                                         | D-0054   | EV-0099  |
| `9acc936` | P3-08                    | Environments, deployment, and production exports                         | D-0055   | EV-0100  |
| `0801f68` | P3-09                    | Mobile and store workflow                                                 | D-0056   | EV-0101  |
| `ec0b51f` | P3-10                    | Governance workflow                                                      | D-0057   | EV-0102  |
| `f758d44` | P3-11                    | Observability                                                            | D-0058   | EV-0103  |
| `2665742` | P3-12                    | Product and business analytics + grounded business-health recommendations | D-0059   | EV-0104  |
| `31f49d4` | P3-13                    | Internal administrative operations                                       | D-0060   | EV-0105  |
| `4bbc705` | P3-14                    | Product Outcome foundation + bounded Continuous Product Agent foundation  | D-0061   | EV-0106  |

Decomposition itself recorded as D-0046 (`execution/decisions/ledger.jsonl`), following the same
dependency-ordered, `execution/state.json`-tracked pattern established for Phase 2's P2-01..P2-17.

## Master Spec §61 required capabilities → evidence

| Capability                                                                          | Unit(s) | Evidence |
| ------------------------------------------------------------------------------------ | ------- | -------- |
| Real server-side AI provider connections                                             | P3-01   | EV-0092  |
| Production database and authentication                                               | P3-02   | EV-0093, EV-0098 |
| Migrations and tenant-isolation verification                                         | P3-02   | EV-0093 (`verify-migration-safety.ts`, `verify-tenant-isolation.ts`) |
| Credential vault and OAuth where supported                                           | P3-05   | EV-0096 |
| Pocket Studio production billing                                                     | P3-04   | EV-0095 |
| Plans, entitlements, usage metering, limits, and overages                            | P3-03   | EV-0094 |
| Billing portal, verified webhooks and reconciliation                                 | P3-04   | EV-0095 |
| Failed-payment retries, grace periods, restriction/suspension/restoration/retention/deletion | P3-04 | EV-0095 |
| Customer-owned infrastructure protection                                             | P3-05   | EV-0096 |
| Managed-hosting suspension                                                           | Not implemented — see Known limitations (not commercially enabled this phase) | — |
| Customer-owned generated-app payment and subscription connections                    | P3-06   | EV-0097 |
| Production email                                                                     | P3-07   | EV-0099 |
| Monitoring and analytics, audit logs, cost tracking                                  | P3-11   | EV-0103 |
| Customer-owned integration connections                                               | P3-05   | EV-0096 |
| Development, Preview, Staging, and Production environments; supported deployment; deployment evidence and rollback | P3-08 | EV-0100 |
| Production exports                                                                   | P3-08   | EV-0100 |
| Customer-owned Apple and Google account connection workflows                         | P3-09   | EV-0101 |
| iOS and Android production-build workflows, testing-track preparation                | P3-09   | EV-0101 |
| Store metadata, assets, disclosures, and submission packages                         | P3-09   | EV-0101 |
| Explicit submission approval; supported submission and status tracking; rejection and remediation; releases and updates | P3-09 | EV-0101 |
| Continuous governance-source monitoring; governance change detection and impact      | P3-10   | EV-0102 |
| Customer notification and remediation; professional-review workflow                  | P3-10   | EV-0102 |
| Policy publication and acceptance tracking; multilingual governance synchronization   | P3-10   | EV-0102 |
| Observability and incident response                                                  | P3-11   | EV-0103 |
| Product and business analytics; grounded business-health recommendations             | P3-12   | EV-0104 |
| Internal administrative operations                                                   | P3-13   | EV-0105 |
| Product Outcome foundation                                                           | P3-14   | EV-0106 |
| Bounded Continuous Product Agent foundation                                          | P3-14   | EV-0106 |

## Master Spec §66 exit criteria → evidence

**A supported paying customer can:**

| Requirement | Evidence |
| --- | --- |
| Create an account and organization | Phase 1 (reused, not re-tested this phase) |
| Subscribe and receive entitlements | EV-0094 (P3-03 entitlements), EV-0095 (P3-04 real billing) — no live checkout UI wired to a real card; see Known limitations |
| Use real AI generation and production persistence | EV-0092 (real Anthropic connection, mock remains default) |
| Create a project | Phase 1 (reused) |
| Receive Product and Business Intelligence | Phase 1/2 (reused) |
| Generate a supported web or mobile application | Phase 2 (reused) |
| Use customer and owner workflows | Phase 2 (reused) |
| Edit conversationally | Phase 2 (reused) |
| Version and restore | Phase 2 (reused) |
| Validate and test | Phase 2 (reused; Quality Gate) |
| Connect required customer-owned services | EV-0096 (OAuth), EV-0097 (generated-app payments) |
| Export | EV-0100 (production exports, real ExportRecord audit trail) |
| Create supported builds | EV-0101 (mobile scaffold + submission workflow) |
| Prepare accurate launch and store artifacts | EV-0101 |
| Complete supported testing | EV-0101 (`INTERNAL_TESTING`/`BETA` tracks modeled) |
| Approve deployment or submission | EV-0100 (deployment), EV-0101 (`approveGovernanceRemediation`-style customer approval steps) |
| Record deployment/submission evidence | EV-0100, EV-0101 |
| Understand platform-specific status | EV-0100, EV-0101, EV-0104 (product analytics snapshot) |
| Manage rejection and remediation | EV-0101 (store submission), EV-0102 (governance) |
| Prepare releases and updates | EV-0101 (`releaseStoreSubmission`) |

**The platform must demonstrate:**

| Requirement | Evidence |
| --- | --- |
| Tested tenant and credential isolation | EV-0093 (`verify-tenant-isolation.ts`, 0 violations, exact-match reviewed-exception list) — re-verified after every subsequent unit this phase |
| Real billing and webhook processing | EV-0095 |
| Usage metering | EV-0094 |
| Failed-payment and restoration behavior | EV-0095 |
| Customer-owned infrastructure protection | EV-0096 |
| Retention and deletion behavior | EV-0095 |
| Deployment and rollback | EV-0100 |
| Store readiness and platform Truth Status | EV-0101 (store-readiness.ts's developer-account check now real, not hardcoded) |
| Governance monitoring and impact | EV-0102 |
| Policy versioning and approvals | EV-0102 (PolicyDocument DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED) |
| Monitoring, analytics, cost intelligence, support boundaries, and incident response | EV-0103, EV-0104, EV-0105 |
| A complete Production Readiness Report with truthful limitations | This document |

**Independent Level 3 review accepts the phase:** Pending — this review.

## Full evidence and decision ledgers

- `execution/evidence/ledger.jsonl` — 106 records total; Phase 3's portion is EV-0092 through EV-0106
  (15 records — 14 units + the mid-phase regression repair), each with evidence type, verification
  method, result, and limitations.
- `execution/decisions/ledger.jsonl` — 61 records total; Phase 3's portion is D-0046 through D-0061
  (16 records — the decomposition plus 14 units plus the regression repair), each with reason,
  alternatives considered, and impact.
- `execution/state.json` — machine-readable current state; `phase.unitDecomposition` lists all 14 units,
  each `complete` with its evidence pointer.

## Architectural patterns established and applied consistently this phase

- **Provider abstraction**: every real external integration (AIProvider, BillingProvider,
  GeneratedAppPaymentProvider, EmailProvider, DeploymentProvider, StoreReviewProvider) is a real
  interface with a deterministic mock (the default) and, where a genuine external account exists to
  test the shape against, a real implementation over raw `fetch`/`crypto`/`tls` — never an SDK
  dependency. None has been exercised against a live external account in this environment; every one
  is disclosed `PROTOTYPE_ONLY` or `SUPPORTED_LATER_PHASE` in the Capability Registry, never silently
  implied as production-proven.
- **"Pick the protocol, not the vendor"**: OAuth2 (P3-05) and SMTP (P3-07) are real universal standards
  implemented directly; no specific vendor is picked where Master Spec does not itself name one (unlike
  payments, where "e.g. Stripe" was already a named illustrative example in this codebase's own
  pre-existing seed data). Deployment hosting (P3-08) and app-store review (P3-09) have no such
  universal protocol, so each has only a mock behind a real, tested record-keeping/workflow state
  machine.
- **No-actor exceptions, individually reviewed**: `authenticateGeneratedAppUser`, `applyBillingLifecycleEventFromWebhook`, `createGeneratedAppCharge`, `retrieveCredentialSecretForGeneratedApp`,
  `recordPolicyAcceptance` — a generated product's own runtime has no Pocket Studio member "acting."
  `createGovernanceImpactAssessment`, `notifyCustomerOfGovernanceImpact`,
  `dismissGovernanceImpactAssessment` — operator-only, now gated by real platform-admin access (P3-13)
  rather than left unauthorized. All 8 are enumerated in `verify-tenant-isolation.ts`'s
  `ALLOWED_EXCEPTIONS` with individual justifications and enforced by an exact-match test.
- **Every real or mock attempt is a durable, queryable fact**: `LoginAttempt`, `ProcessedWebhookEvent`,
  `GeneratedAppPayment`, `SentEmail`, `Deployment`, `StoreSubmission`, `AuditLogEntry`, `AiUsageEvent`,
  `IncidentReport`, `ProductOutcomeRecord` — none silently drop a failure.
- **Never fabricate a number or a claim of authority this build does not have**: AI cost is only
  computed once an operator configures a real, verified per-token rate (never hardcoded); governance
  requirements and incidents are recorded only once a real human operator has verified them (no live
  external source is scraped or invented); the Continuous Product Agent (P3-14) only ever proposes a
  `CONSEQUENTIAL`/`PENDING_APPROVAL` Decision Ledger entry from deterministic, evidenced findings —
  never AI-generated business advice, never auto-applied.
- **Deliberately real security fixes, not just new features**: the user-directed P3-02 regression
  review (D-0053) found and fixed 5 real, previously-shipped defects (email-only lockout DoS, a timing
  side channel, a concurrency race, audit-trail deletion on login success, unbounded cleanup) with a
  dedicated regression test for each — the single largest self-contained repair this phase.

## Known limitations (truthful, current)

- **No real external account has ever been exercised** for any Phase 3 provider (Anthropic, Stripe,
  any OAuth provider, SMTP, Apple/Google developer accounts) — every provider defaults to its
  deterministic mock; real implementations exist and are tested against fully scripted fake
  conversations, never a live network call in this environment.
- **AI generation remains deterministic/template-based by default** (Phase 2's generation pipeline is
  unchanged) — `AnthropicAIProvider` is real and tested but not the default, and not wired into
  Blueprint/Build Plan generation itself, only `resolveIntent`.
- **No scheduled-job infrastructure exists anywhere in this codebase** — every time-based workflow this
  phase discloses this as a real, recurring gap: `deleteOldLoginAttempts` (P3-02), 5 of 8
  `BillingLifecycleEvent` transitions (P3-04, only reachable via manual `transitionBillingState`), and
  `proposeContinuousProductRecommendations` (P3-14) all require an explicit call; none run
  automatically on any interval.
- **No real native mobile build exists** — the Expo scaffold (Phase 2) is syntax-validated TypeScript,
  never a signed `.ipa`/`.apk` (no Xcode/Android SDK in this environment); store submissions record
  real version/buildNumber facts but nothing is actually compiled.
- **Real Apple/Google review is never performed** — `StoreReviewProvider` has only a mock
  implementation; §44's "explicit customer approval required before any real submission" boundary is
  preserved by `assessStoreReadiness` permanently returning `NOT_READY`, never `READY`, regardless of
  which individual checks pass.
- **No real external legal/regulatory source is monitored or scraped** — `recordGovernanceRequirement`
  only records what a real, disclosed human operator has verified against a real source; there is no
  live "continuous" polling loop.
- **Deployment hosting has no real implementation at all** — `DeploymentProvider` is mock-only
  (`SUPPORTED_LATER_PHASE`, not `PROTOTYPE_ONLY`, since unlike every other provider this phase there is
  no real implementation behind the interface yet).
- **Audit logging covers only 3 real, security-sensitive actions** (credential stored, credential
  accessed, member-driven billing state transition) — not a comprehensive audit of every sensitive
  action in the codebase, explicitly disclosed rather than presented as complete.
- **AI cost tracking never computes a dollar figure by default** — `AI_COST_PER_1K_INPUT_TOKENS_CENTS`/
  `AI_COST_PER_1K_OUTPUT_TOKENS_CENTS` are unset unless an operator explicitly configures them.
- **Platform-admin bootstrap has no out-of-band verification** — any authenticated user can self-grant
  the first admin role while zero admins exist, the standard "first user becomes admin" pattern for a
  cold-start system, with no signed-invitation step.
- **The Continuous Product Agent is a call-it-yourself foundation, not a live loop** — it never runs
  automatically, never updates a Decision's `approvalStatus`, and never changes prices, refunds,
  policies, or production behavior itself; a human must act on every proposal.
- **Product Outcome tracking is a foundation, not the mature Product Outcome Graph** Master Spec §48
  names as future "Maximum Vision" — outcome facts are simple `(metricKey, value, source)` rows.
- **No Studio UI page renders any Phase 3 feature** — every unit this phase shipped a real, tested
  service layer with no corresponding customer-facing page; this is a consistent, disclosed pattern
  across all 14 units, not an oversight specific to one. The existing Studio UI (Phase 1/2) is
  unaffected and continues to work.
- **Managed-hosting suspension is not implemented** — §61 makes this conditional ("only if commercially
  enabled and operationally supported"); this build has not commercially enabled managed hosting, so
  the capability is honestly absent rather than partially built.
- **A pre-existing, unrelated data-quality defect was found (not fixed) in the Evidence Ledger**: line
  47 (`EV-0047`, a Phase 1 review record) contains an unescaped backslash that breaks naive `JSON.parse`
  of the raw file; every Phase 3 evidence entry was individually validated as well-formed JSON before
  being appended, and this pre-existing issue does not affect any Phase 3 evidence's validity, but is
  flagged here for a future cleanup pass.
- Every Phase 1/2 known limitation not superseded by Phase 3's scope still applies (see
  `execution/reviews/level3/phase-2/PHASE_2_EXIT_PACKAGE.md`'s own Known Limitations section).

## Validation state (current, at exit)

- `npx tsc --noEmit`: clean.
- `npx eslint . --max-warnings=0`: clean.
- `npx prettier --check .`: clean.
- `npx vitest run`: **671/671** unit+integration tests, stable across repeated runs throughout the
  phase (each unit's own evidence entry records the count at that point: 434 → 671).
- `npx vitest run` on `verify-tenant-isolation.test.ts` and `verify-migration-safety.test.ts` directly:
  0 violations at every unit boundary this phase, including after every schema/authorization change.
- `rm -rf .next && npx next build`: succeeds.
- `npx playwright test`: **24/24** e2e tests pass (stable; one isolated `golden-path.spec.ts` timing
  flake was observed and confirmed non-reproducing via both a standalone re-run and a full-suite
  re-run during P3-14's validation — unrelated to any Phase 3 code path).

## Required customer actions

None. Phase 3 requires no live credentials (AI, Stripe, SMTP, OAuth providers, Apple/Google developer
accounts) to satisfy any exit criterion — every mock provider is the default, and honest
`PROTOTYPE_ONLY`/`SUPPORTED_LATER_PHASE`/`NOT_READY` Truth Status and Capability Registry entries
satisfy Phase 3's exit criteria without them, the same posture Phase 2 took toward Phase 3's own
then-future requirements.

## Required external actions (for real production launch, beyond this phase's exit)

A real `ANTHROPIC_API_KEY`; a real Stripe (or equivalent) account and webhook secret; real SMTP
credentials; a real OAuth provider registration for customer-owned integrations; real Apple Developer
Program and Google Play Developer accounts; a real, named hosting/deployment vendor decision (none is
authorized or picked anywhere in this codebase); a real, verified AI per-token cost rate; the first
platform-admin bootstrap step; scheduled-job infrastructure for every time-based workflow disclosed
above as manual-only today.

## Independence status

This review is to be conducted by a fresh-context subagent per Review Protocol §2, spawned with the
three governance documents, repository access, and this evidence package — not the parent
conversation's history, self-justification, or reasoning.
