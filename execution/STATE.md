# Pocket Studio Official — Execution State

Human-readable companion to `execution/state.json`. `state.json` is authoritative for machine consumption; this file is authoritative for human review. On any drift between the two, reconcile in favor of repository reality (per Execution Protocol §1 authority order — verified repository state outranks both).

## Current Position

- **Phase:** Phase 1 — Intelligence, Business Foundation, Trust Architecture, and Premium Experience
- **Phase status:** active
- **Milestone:** M1-foundation — repository/project foundation, durable multi-tenant state, provider abstraction
- **Active implementation unit:** P1-08 (Integrations, credential-vault architecture, governance profile)

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
  `syncTruthStatusFromFeasibility` maps a capability's *platform* `implementationLevel` to a conservative
  *per-project* status: `SUPPORTED_NOW → IMPLEMENTED`, every `SUPPORTED_WITH_*`/`SUPPORTED_LATER_PHASE`/
  `PROTOTYPE_ONLY`/`PLANNING_ONLY → PLANNED`, `EXTERNAL_APPROVAL_REQUIRED`/`PROFESSIONAL_REVIEW_REQUIRED
  → BLOCKED`, `NOT_CURRENTLY_SUPPORTED`/`UNSAFE_OR_PROHIBITED → UNSUPPORTED`, and no registry entry
  (or `INSUFFICIENT_INFORMATION`) `→ NOT_EVALUATED` — a platform capability being ready does not mean
  anything was built for a specific project (Master Spec §4.4, `D-0011`). Every status entry references
  the `ProductEvidence` record that justifies it. Wired into `generateProductIntelligence` (syncs Truth
  Status from the Feasibility Report, records a `PRODUCT_STATE_VERSION_CREATED` event) and the Decision
  Ledger (`DECISION_RECORDED`/`DECISION_RESPONDED` events). 15 new tests plus 2 pre-existing suites
  re-verified against the new side effects (122 total). Evidence: `EV-0026`..`EV-0029`.

## Active

- P1-08: Integration Requirements tracking, secure credential-vault architecture (encrypted
  server-side, never in chat/bundles/prompts/logs), and governance profile/requirement architecture plus
  policy-document model scaffolding (Master Spec §4.7, §30, §32, §34).

## Deferred

- Nothing yet deferred.

## Blocked

- None. No credential or customer-decision blockers exist yet; Phase 1 runs on the mock AI provider per
  Master Spec §8 / Execution Protocol §8 and does not require live AI, Stripe, Apple, or Google credentials.

## Known Limitations (truthful, current)

- Auth/tenancy/product-state/orchestration/registry/truth-status exist only as a service/library layer —
  no UI, Server Actions, or HTTP routes wire them up yet (that is P1-10/P1-11). Tenant isolation is
  proven at the service+authz layer against a real database, not yet at the HTTP boundary.
- AI provider is mock-only; Requirements Engine, Business Model Brief, and unit economics are
  deterministic/template-based, not real product or market intelligence — but this is now an honest,
  queryable Truth Status fact per project, not just a code comment.
- Evidence in Phase 1 is necessarily about intelligence-generation claims (registry lookups), not
  implementation/test/build/deployment evidence, since no generation system exists yet (Phase 2).
- Phase 1's own customer flow (§51) never requires an edit; full conversational editing with
  impact-aware regeneration is Phase 2 scope (§55, §57) and is not implemented.
- Product Knowledge graph only exercises REQUIREMENT/WORKFLOW node types so far; no generation system
  yet produces Screen/Action/DataModel nodes (Phase 2 concern).
- No customer-owned integrations, credential vault, or governance profile yet — P1-08, active now.
- No automated e2e (Playwright) coverage yet — nothing customer-facing exists to test end-to-end.

## Next Action

Implement P1-08: an Integration Requirements model tracking category/purpose/required-or-optional/
provider options/ownership/connection status (Master Spec §30), a secure credential-vault architecture
(encrypted server-side references, never secrets in chat/bundles/prompts/logs — §4.7), and a governance
profile/requirement architecture plus policy-document model scaffolding (§32, §34).

## Decision Ledger Pointer

See `execution/decisions/ledger.jsonl` (build-process architecture decisions). Product-facing Decision Ledger (Master Spec §15, a Phase 1 customer-facing capability) will be implemented as an application data model, not conflated with this file.

## Evidence Ledger Pointer

See `execution/evidence/ledger.jsonl` (Evidence Contract v1, Execution Protocol §10).

## Review Log Pointer

See `execution/reviews/` for Level 1/2/3 review records per Review Protocol.
