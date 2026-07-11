# Pocket Studio Official — Execution State

Human-readable companion to `execution/state.json`. `state.json` is authoritative for machine consumption; this file is authoritative for human review. On any drift between the two, reconcile in favor of repository reality (per Execution Protocol §1 authority order — verified repository state outranks both).

## Current Position

- **Phase:** Phase 1 — Intelligence, Business Foundation, Trust Architecture, and Premium Experience
- **Phase status:** active
- **Milestone:** M1-foundation — repository/project foundation, durable multi-tenant state, provider abstraction
- **Active implementation unit:** P1-03 (Canonical Product State, Product DNA, Product Memory, Knowledge relationships)

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
  `requireOrganizationMembership` / `requireProjectAccess`) resolves a project's *actual* owning
  organization before checking membership — a caller-supplied organizationId is never trusted directly.
  17 integration tests run against the real test database (not mocks) prove: same-tenant access works,
  cross-tenant organization and project access is denied, project creation is denied for non-members (and
  verified no row is created), minimum-role enforcement works, and a nonexistent project id fails closed
  without leaking existence. Caught and fixed a real cross-file test-parallelism race where three
  integration test files sharing one Postgres database stomped on each other's fixtures (`D-0005`).
  Evidence: `EV-0007`..`EV-0012`.

## Active

- P1-03: persisted, versioned Canonical Product State, Product DNA, Product Memory, and Product Knowledge
  relationships (Requirement→Workflow→Screen→Action→Data Model→Permission→Integration→Implementation→
  Test→Evidence), scoped per project/tenant. Traces to Master Spec §9-12.

## Deferred

- Nothing yet deferred.

## Blocked

- None. No credential or customer-decision blockers exist yet; Phase 1 runs on the mock AI provider per
  Master Spec §8 / Execution Protocol §8 and does not require live AI, Stripe, Apple, or Google credentials.

## Known Limitations (truthful, current)

- Auth/tenancy exist only as a service/library layer — no UI, Server Actions, or HTTP routes wire them up
  yet (that is P1-10/P1-11). Tenant isolation is proven at the service+authz layer against a real
  database, not yet at the HTTP boundary, because no HTTP routes exist yet to test.
- No Canonical Product State / Product DNA / Product Memory yet (P1-03, active now).
- AI provider is mock-only; no live provider is connected (by design).
- No automated e2e (Playwright) coverage yet — nothing customer-facing exists to test end-to-end.

## Next Action

Implement P1-03: Canonical Product State, Product DNA, Product Memory, and Product Knowledge relationship
data models, project-scoped and versioned, per Master Spec §9-12.

## Decision Ledger Pointer

See `execution/decisions/ledger.jsonl` (build-process architecture decisions). Product-facing Decision Ledger (Master Spec §15, a Phase 1 customer-facing capability) will be implemented as an application data model, not conflated with this file.

## Evidence Ledger Pointer

See `execution/evidence/ledger.jsonl` (Evidence Contract v1, Execution Protocol §10).

## Review Log Pointer

See `execution/reviews/` for Level 1/2/3 review records per Review Protocol.
