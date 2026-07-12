# Pocket Studio Official — Execution State

Human-readable companion to `execution/state.json`. `state.json` is authoritative for machine consumption; this file is authoritative for human review. On any drift between the two, reconcile in favor of repository reality (per Execution Protocol §1 authority order — verified repository state outranks both).

## Current Position

- **Phase:** Phase 1 — Intelligence, Business Foundation, Trust Architecture, and Premium Experience
- **Phase status:** active
- **Milestone:** M1-foundation is complete (P1-01..P1-09); now in **M2-studio-shell** — wiring the
  foundation service layer to real customer-facing surfaces (Master Spec §51 first customer flow)
- **Active implementation unit:** P1-11 (First customer flow end-to-end + validation suite)

## Completed

- Governance baseline committed (`25a33f0`): Master Spec, Execution Protocol, Review Protocol v1.0, all in `docs/`.
- Completeness Check (Execution Protocol §2) passed — see `EV-0001` in the Evidence Ledger.
- Durable execution state initialized (this directory).
- **P1-01 — Repo/app foundation.** Next.js 16.2.10 App Router + React 19.2.4, strict TypeScript
  (`noUncheckedIndexedAccess`, `noImplicitOverride`, etc.), Tailwind 4, ESLint (eslint-config-next),
  Prettier (+ tailwindcss plugin, `docs/` excluded — see D-0003), Vitest + Testing Library, Playwright
  scaffolding, Prisma 7 with the new driver-adapter architecture (`@prisma/adapter-pg` + `pg`,
  `prisma.config.ts`) against a local Postgres run via `docker-compose.yml`, server-only env validation
  (`src/lib/env.ts`, zod), and a `/api/health` route proving real DB connectivity. Full validation suite
  (typecheck, lint, format check, unit tests, production build, manual runtime smoke test) passes —
  see `EV-0002`..`EV-0006`. Next.js 16 / Prisma 7 breaking changes vs. older conventions documented in
  `D-0002`.
- **P1-02 — Data layer.** Prisma schema + first migration (`20260711133038_init_identity_and_tenancy`)
  for User, Session, Organization, Membership (role enum: OWNER/ADMIN/MEMBER), Project — applied to both
  the dev database and a dedicated `pocket_studio_test` database (see `docker/postgres-init/`). Password
  hashing via Node's built-in scrypt (`D-0004`, no new native-binding dependency). Opaque, hashed session
  tokens in httpOnly cookies. The tenant-isolation choke point (`src/lib/tenancy/authz.ts`:
  `requireOrganizationMembership` / `requireProjectAccess`) resolves a project's _actual_ owning
  organization before checking membership — a caller-supplied organizationId is never trusted directly.
  17 integration tests run against the real test database (not mocks) prove: same-tenant access works,
  cross-tenant organization and project access is denied, project creation is denied for non-members (and
  verified no row is created), minimum-role enforcement works, and a nonexistent project id fails closed
  without leaking existence. Caught and fixed a real cross-file test-parallelism race where three
  integration test files sharing one Postgres database stomped on each other's fixtures (`D-0005`).
  Evidence: `EV-0007`..`EV-0012`.
- **P1-03 — Canonical Product State, Product DNA, Product Memory, Product Knowledge relationships.**
  Migration `20260711135504_product_state_dna_memory_knowledge`. `ProductState` and `ProductDNA` are
  append-only/versioned (each write creates a new row; "current" is the latest version, prior versions
  stay inspectable). `ProductDNA` partial updates merge onto the previous version instead of replacing it
  — omitting a key carries the old value forward, passing `null` explicitly clears it — implementing
  Master Spec §10's "edits must not silently erase Product DNA." `ProductMemoryEntry` is discrete, typed,
  appendable entries (not one blob), matching §11's rejection of "unbounded chat history" as the sole
  memory architecture. `ProductKnowledgeNode`/`ProductKnowledgeEdge` form a generic typed graph with
  stable cuid ids for the §12 Requirement→Workflow→Screen→...→Evidence chain; edges are rejected across
  projects and self-loops are rejected. Caught and fixed a real bug during implementation: Prisma's
  generated create input rejects a literal `null` for nullable Json columns (needs the `Prisma.JsonNull`
  sentinel), and an early test conflated "key omitted" with "key present but `undefined`" — both
  distinct states in JS but not distinguishable the way the code first assumed. Fixed at the type level
  so the public contract only recognizes two states (`D-0006`). 28 integration tests across the four
  models. Evidence: `EV-0013`..`EV-0015`.
- **P1-04 — Orchestration Contract, Intent Resolver, Impact Analysis foundation, Decision Ledger.**
  AI provider abstraction (`src/lib/ai/`): one interface, `MockAIProvider` fully implemented
  (deterministic, no external calls — `summary` echoes input rather than paraphrasing it, so it never
  misrepresents itself as real understanding), `AnthropicAIProvider` stubbed to throw
  `ProviderNotImplementedError` since real provider connections are Phase 3 scope (Master Spec §61,
  `D-0007`). Intent Resolver classifies a submission as `describe_idea` vs. `edit_request` by checking
  for existing Product State. Impact Analysis (`src/lib/orchestration/impact-analysis.ts`) is a
  deterministic keyword categorizer against the Master Spec §14 impact categories, flagging
  monetization/security/privacy/governance as consequential per §4.2. Product-facing Decision Ledger
  (`Decision` model, distinct from this file's build-process ledger) implements §15 disclosure tiers:
  ROUTINE auto-applies, IMPORTANT is recommended-but-not-applied, CONSEQUENTIAL holds
  `PENDING_APPROVAL` until an explicit approve/reject response. `beginChangeFlow` wires intent
  resolution → impact analysis → decision recording into the early stages of the §13 Orchestration
  Contract flow. Caught and fixed a real bug during implementation: plain substring matching flagged
  "Build a premium booking app" as touching "screens" because "build" contains "ui" (the screens
  keyword). Fixing this by requiring both-edge word boundaries then broke matching on ordinary plurals
  like "deposits". Settled on left-boundary-only matching (`D-0008`), with regression tests for both
  failure modes. 33 new tests (68 total in the suite). Evidence: `EV-0016`..`EV-0019`.
- **P1-05 — Capability and Feasibility Engine, Supported Capability Registry.** Platform-wide (not
  tenant-scoped — this is Pocket Studio's own policy, not customer data), append-only versioned per
  `capabilityKey`, migration `20260711142316_capability_registry`. The `implementationLevel` enum
  mirrors Master Spec §4.3's classification exactly. Seed data (`src/lib/registry/seed-data.ts`) is
  deliberately truthful: only `auth.email_password` and `tenancy.organizations_and_projects` are
  `SUPPORTED_NOW`; generation, payments, mobile, live AI, governance drafts, store distribution, and
  Pocket Studio's own billing are all `SUPPORTED_LATER_PHASE` or `EXTERNAL_APPROVAL_REQUIRED`, each
  citing the specific Master Spec section that defers it (`D-0009`) — the registry never overstates
  what exists today. `assessFeasibility` looks capability keys up against the registry and reports
  unrecognized keys explicitly rather than assuming support. 13 new tests (81 total). Evidence:
  `EV-0020`..`EV-0022`.
- **P1-06 — Product Intelligence, Requirements Engine, Business Model Brief, unit economics.**
  `deriveRequirements` reuses Impact Analysis's categories as its signal source (one taxonomy, not two)
  to produce EXPLICIT/INFERRED/RECOMMENDED requirement statements; `extractTargetCustomer` does
  best-effort "... for &lt;audience&gt;" pattern matching, honestly labeled as not real language
  understanding. `suggestCapabilityKeys` only ever emits keys that exist in the seed-data registry —
  never invents a plausible-sounding one, so Feasibility can catch drift. `deriveBusinessModelBrief` and
  `deriveMonetizationRecommendations` (Master Spec §19) default toward simplicity and never assume a
  price. `defaultUnitEconomicsAssumptions` (§20) labels every field's source (`unknown` / `estimate`;
  never `provider_reported` or `actual_connected` in Phase 1). `generateProductIntelligence` wires all
  of it together: derives everything, calls `assessFeasibility` (P1-05) for a real Feasibility Report,
  then persists a new Canonical Product State version, a new Product DNA version, one Requirement
  knowledge node per derived requirement, a FACT memory entry for the original idea, and an
  OPEN_QUESTION memory entry per real gap. Wired into `beginChangeFlow` for `describe_idea` intents only
  — Phase 1's own customer flow (§51) never requires an edit, so `edit_request` handling stays at the
  disclosure/approval level until Phase 2's conversational editing (§55, §57) (`D-0010`). 25 new tests
  (107 total). Evidence: `EV-0023`..`EV-0025`.
- **P1-07 — Event Ledger, Evidence Ledger, Truth Status (product-facing).** `ProductEvent` is an
  append-only audit trail; `ProductEvidence` backs every claim with a verifiable record; `TruthStatusEntry`
  is versioned per `(projectId, subjectKey)`, same latest-wins pattern as the other append-only models.
  `syncTruthStatusFromFeasibility` maps a capability's _platform_ `implementationLevel` to a conservative
  _per-project_ status: `SUPPORTED_NOW → IMPLEMENTED`, every `SUPPORTED_WITH_*`/`SUPPORTED_LATER_PHASE`/
  `PROTOTYPE_ONLY`/`PLANNING_ONLY → PLANNED`, `EXTERNAL_APPROVAL_REQUIRED`/`PROFESSIONAL_REVIEW_REQUIRED
→ BLOCKED`, `NOT_CURRENTLY_SUPPORTED`/`UNSAFE_OR_PROHIBITED → UNSUPPORTED`, and no registry entry
  (or `INSUFFICIENT_INFORMATION`) `→ NOT_EVALUATED` — a platform capability being ready does not mean
  anything was built for a specific project (Master Spec §4.4, `D-0011`). Every status entry references
  the `ProductEvidence` record that justifies it. Wired into `generateProductIntelligence` (syncs Truth
  Status from the Feasibility Report, records a `PRODUCT_STATE_VERSION_CREATED` event) and the Decision
  Ledger (`DECISION_RECORDED`/`DECISION_RESPONDED` events). 15 new tests plus 2 pre-existing suites
  re-verified against the new side effects (122 total). Evidence: `EV-0026`..`EV-0029`.
- **P1-08 — Integrations, credential-vault architecture, governance profile.** `IntegrationRequirement`
  is upsert-by-`(project, category)` (Master Spec §30) — current connection state, not an intelligence
  artifact needing history. The credential vault (`src/lib/credentials/`) is real AES-256-GCM: a fresh
  random IV per `encryptSecret` call, GCM's auth tag detects tampering (verified with dedicated tests),
  keyed by a server-only `CREDENTIAL_ENCRYPTION_KEY`. `storeCredential`/`retrieveCredentialSecret` are
  the only functions that ever touch plaintext; `getCredentialMetadata` is a separate, deliberately
  narrower accessor that never returns ciphertext/iv/authTag, so it's safe to expose broadly (`D-0012`).
  `GovernanceProfile` is one mutable profile per project (§32) — deliberately excludes the full external
  Governance Requirement Registry, since Continuous Governance Monitoring is explicit Phase 3 scope
  (§33, §65). `PolicyDocument` is versioned per `(project, type, language)` (§34/§35) — durable model
  only, no generation logic yet (drafting is optional per §34, not a Phase 1 requirement). 23 new tests
  plus a 5-test crypto suite (145 total). Runtime-verified: `npm run build && npm run start` still boots
  and `/api/health` still reaches Postgres with the new required env var. Evidence: `EV-0030`..`EV-0034`.
- **P1-09 — Plans, entitlements, billing-state architecture.** `PlanDefinition` is platform-wide,
  versioned per `planKey` (same pattern as the Capability Registry) — only Free/Explore has a real,
  known price (0); every paid plan's price is left unset rather than invented (Master Spec §36).
  `OrganizationSubscription` is one row per organization (billing is account-level, not project-level);
  every organization gets a Free/Explore, TRIALING subscription at creation so entitlement checks never
  special-case "no subscription." `billingState` changes only through `nextBillingState`, a deterministic
  state machine mirroring §37's failed-payment workflow exactly — full access persists through
  PAST_DUE/PAYMENT_RETRYING/GRACE_PERIOD (nonpayment must not trigger immediate restriction), only
  RESTRICTED/SUSPENDED/CANCELED/etc. drop to "restricted" (never fully blocked — login, billing access,
  payment updates, read-only projects, portability export, support, and cancellation stay available per
  §37), and only actual `DELETED` has no access. Every transition is recorded as an immutable
  `BillingEvent` (`D-0013`). 22 new tests, including a full walk of the entire failed-payment sequence
  and rejection of invalid transitions (167 total). Evidence: `EV-0035`..`EV-0038`.

- **P1-10 — Premium landing, auth/onboarding, dashboard, Studio shell (Simple + Expert Mode).** Server
  Actions (`src/lib/actions/`) wrap the entire M1-foundation service layer for the first time: sign-up/
  sign-in/sign-out, organization + project creation (creating an org also calls `createSubscription`, so
  every workspace has real billing state from birth), idea submission (`beginChangeFlow`), and decision
  approval/decline. Simple Mode renders Product DNA, pending-decision approval cards, a Business section
  from the real Business Model Brief, and a Trust section listing real `TruthStatusEntry` rows with
  color-coded badges. Expert Mode renders the same underlying state structurally: Product State version
  history, the full Decision Ledger, and the Event Ledger. Caught two real bugs by actually running the
  app in a browser rather than trusting unit tests alone: (1) an unauthenticated visitor hitting a
  protected page got an uncaught 500, not a redirect — fixed with a dedicated `requireUserForPage` page
  guard, `requireCurrentUser` kept as-is for service/API contexts (`D-0014`); (2) the dev database's
  Capability Registry was never seeded outside of tests, so every Feasibility assessment showed
  "Not evaluated" instead of the real "Planned" status — fixed with `prisma/seed.ts` (`npm run db:seed`,
  requires `NODE_OPTIONS=--conditions=react-server` to bypass `server-only`'s bundler-only guard under
  plain Node) (`D-0015`). Verified with `e2e/golden-path.spec.ts`, a real Playwright/Chromium test that
  drives the actual §51 flow — landing → sign-up → onboarding → project creation → idea submission →
  generated Product Intelligence visible in both modes — against a real production build and Postgres,
  not mocks. curl could not have validated any of this: React Server Actions use their own RPC protocol,
  not a plain form POST a generic HTTP client can drive. Evidence: `EV-0039`..`EV-0040`.

## Active

- P1-11: run the complete Official §51 customer flow end to end, broaden e2e coverage beyond the single
  golden-path test (decision approval buttons, billing page, the flow's remaining steps), and assemble
  Phase 1's full validation suite as one evidence-backed pass ahead of the Level 3 phase-exit review.

## Deferred

- Nothing yet deferred.

## Blocked

- None. No credential or customer-decision blockers exist yet; Phase 1 runs on the mock AI provider per
  Master Spec §8 / Execution Protocol §8 and does not require live AI, Stripe, Apple, or Google credentials.

## Known Limitations (truthful, current)

- Only the `describe_idea` path (first idea submission) has e2e coverage; edit_request, the billing
  page, and decision-approval buttons are unit/integration-tested and manually reviewed but not yet
  e2e-covered — P1-11, active now.
- No real payment provider webhooks exist to drive the billing state machine in production — Phase 3
  scope (§62). No real integration provider (Stripe etc.) is connected to the credential vault yet.
- Policy documents are durable/versioned but not yet generated from real Product State content.
- AI provider is mock-only; Requirements Engine, Business Model Brief, and unit economics are
  deterministic/template-based, not real product or market intelligence — correctly disclosed via
  Truth Status in the UI now, not just in code comments.
- Phase 1's own customer flow (§51) never requires an edit; full conversational editing is Phase 2
  scope (§55, §57).
- Visual design is functional but not pixel-polished "premium" — clean typography/spacing, no custom
  illustration or animation.
- No settings page, integrations UI, or policy-document UI yet — not required by §51's first customer
  flow, deferred to later iteration.
- Product Knowledge graph only exercises REQUIREMENT/WORKFLOW node types so far; no generation system
  yet produces Screen/Action/DataModel nodes (Phase 2 concern).
- No billing/entitlement architecture yet — P1-09, active now.
- No automated e2e (Playwright) coverage yet — nothing customer-facing exists to test end-to-end.

## Next Action

Implement P1-11: run the full Official §51 customer flow end to end (steps 1-17), broaden Playwright
coverage beyond the single golden-path test (decision approval/decline, billing page, return-without-
losing-state), and assemble the complete Phase 1 validation suite (typecheck, lint, unit, integration,
e2e, production build) as one evidence-backed pass before requesting the Level 3 phase-exit review.

## Decision Ledger Pointer

See `execution/decisions/ledger.jsonl` (build-process architecture decisions). Product-facing Decision Ledger (Master Spec §15, a Phase 1 customer-facing capability) will be implemented as an application data model, not conflated with this file.

## Evidence Ledger Pointer

See `execution/evidence/ledger.jsonl` (Evidence Contract v1, Execution Protocol §10).

## Review Log Pointer

See `execution/reviews/` for Level 1/2/3 review records per Review Protocol.
