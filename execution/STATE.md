# Pocket Studio Official — Execution State

Human-readable companion to `execution/state.json`. `state.json` is authoritative for machine consumption; this file is authoritative for human review. On any drift between the two, reconcile in favor of repository reality (per Execution Protocol §1 authority order — verified repository state outranks both).

## Current Position

- **Phase:** Phase 1 — Intelligence, Business Foundation, Trust Architecture, and Premium Experience
- **Phase status:** active
- **Milestone:** M1-foundation — repository/project foundation, durable multi-tenant state, provider abstraction
- **Active implementation unit:** P1-06 (Product Intelligence, Requirements Engine, Business Model Brief, unit economics)

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

## Active

- P1-06: Product Intelligence, Requirements Engine, Business Model Brief, monetization recommendations,
  editable unit-economics assumptions, and operational-complexity analysis, generated via the mock AI
  provider and grounded in the Supported Capability Registry (Master Spec §17, §19-21).

## Deferred

- Nothing yet deferred.

## Blocked

- None. No credential or customer-decision blockers exist yet; Phase 1 runs on the mock AI provider per
  Master Spec §8 / Execution Protocol §8 and does not require live AI, Stripe, Apple, or Google credentials.

## Known Limitations (truthful, current)

- Auth/tenancy/product-state/orchestration/registry exist only as a service/library layer — no UI,
  Server Actions, or HTTP routes wire them up yet (that is P1-10/P1-11). Tenant isolation is proven at
  the service+authz layer against a real database, not yet at the HTTP boundary.
- Intent resolution and impact analysis are deterministic/keyword-based, not real language
  understanding — must remain honestly disclosed in Truth Status once P1-07 exists.
- `assessFeasibility` takes explicit capability keys, not raw text — the raw-text-to-capability-key
  mapping is P1-06's Requirements Engine job.
- `beginChangeFlow` does not yet call `assessFeasibility` — wiring Feasibility into the change flow
  happens once P1-06's Requirements Engine can produce real capability keys from an idea. Change Set
  creation, artifact regeneration, and Truth Status update are added by P1-06/P1-07, extending this
  function rather than duplicating it.
- Product Knowledge graph only exercises REQUIREMENT/WORKFLOW node types so far; no generation system
  yet produces Screen/Action/DataModel nodes (Phase 2 concern).
- AI provider is mock-only; no live provider is connected (by design, Phase 3 scope).
- No automated e2e (Playwright) coverage yet — nothing customer-facing exists to test end-to-end.

## Next Action

Implement P1-06: Product Intelligence, a Requirements Engine, Business Model Brief, monetization
recommendations, editable unit-economics assumptions, and operational-complexity analysis — generated
through the mock AI provider, grounded in the Supported Capability Registry so feasibility claims are
never invented, and persisted as a new Canonical Product State version (Master Spec §17, §19-21).

## Decision Ledger Pointer

See `execution/decisions/ledger.jsonl` (build-process architecture decisions). Product-facing Decision Ledger (Master Spec §15, a Phase 1 customer-facing capability) will be implemented as an application data model, not conflated with this file.

## Evidence Ledger Pointer

See `execution/evidence/ledger.jsonl` (Evidence Contract v1, Execution Protocol §10).

## Review Log Pointer

See `execution/reviews/` for Level 1/2/3 review records per Review Protocol.
