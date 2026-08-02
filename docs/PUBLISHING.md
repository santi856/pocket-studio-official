# Publishing Guide

Status as of 2026-07-27: **Publishing Milestone 1 is implemented** — a signed-in customer can publish an explicit, immutable version of their generated app to a stable public URL, view it while completely signed out of Pocket Studio, publish an update, roll back to the last published version, and unpublish. This document describes what was actually built, the real architecture behind it, and what it deliberately does not do yet.

## Architecture: interpreted, not compiled

Nothing in the generation pipeline (`src/lib/generation/`) writes source files or a repository. A generated app is a versioned `Blueprint` + `BuildPlan` (JSON rows in Postgres), rendered live, per request, by the shared `ComponentRenderer` interpreter. "Publishing" does not build or deploy a separate artifact to a separate host — it makes that same interpreter reachable at a stable, public, unauthenticated URL, served by Pocket Studio's own existing deployment, pinned to one explicit `Blueprint`/`BuildPlan` version pair rather than "whatever is newest."

This is a deliberate architectural choice (see the Publishing Architecture design, evaluated and approved before implementation), not a shortcut: it reuses 100% of the already-built, already-tested rendering, versioning, and tenant-isolation machinery, at zero new hosting cost or vendor integration. A real per-customer compiled artifact and independent hosting account (native app builds, App Store/Play Store submission, a customer's own cloud account) is a distinct, larger future initiative — not started, not assumed, and explicitly out of scope for this milestone.

## Data model

- `ProjectPublication` (`prisma/schema.prisma`) — one row per project, 1:1. Holds `publicSlug` (the stable public identifier, independent of the organization/project slug), `status`, the pinned `publishedBlueprintVersion`/`publishedBuildPlanVersion`, `publishedAt`/`publishedByUserId`, and `lastKnownGoodBlueprintVersion`/`lastKnownGoodBuildPlanVersion` (the one-step-back restore target).
- This is a distinct concept from the pre-existing `Deployment` model, which tracks internal environment (DEV/PREVIEW/STAGING/PRODUCTION) deploy-attempt evidence against a real hosting `DeploymentProvider` (still mock-only, unwired into any route). Publishing never touches `Deployment`.

## State machine

```
DRAFT ──publish──▶ LIVE ──publish (update)──▶ LIVE (new version)
                    │
                    ├──unpublish──▶ UNPUBLISHED ──publish──▶ LIVE
                    │
                    └──billing leaves "full"──▶ SUSPENDED ──billing returns to "full"──▶ LIVE
```

`PUBLISHING` and `PUBLISH_FAILED` also exist in the `PublicationStatus` enum for schema completeness and forward-compatibility, but under the current synchronous, no-external-provider architecture, a publish attempt is a single DB transaction — `PUBLISHING` is not persistently observable, and `PUBLISH_FAILED` only occurs on a genuine unexpected write failure after all preconditions already passed (the prior LIVE version, if any, is always preserved untouched, since a failed transaction never partially applies).

Every transition is idempotent (republishing the exact already-live version, or unpublishing an already-unpublished project, changes nothing and records no duplicate audit/event entries) and serialized per project via a Postgres advisory lock (`pg_advisory_xact_lock`), the same pattern already used by login/submission rate limiting — concurrent Publish clicks from two tabs never race.

`SUSPENDED` is strictly system-driven (billing) and `UNPUBLISHED` is strictly customer-driven; a billing recovery only ever restores `SUSPENDED` publications, never a publication the customer explicitly unpublished.

## Billing policy

Publishing consumes `deploymentAllowed`, a Plan Registry entitlement that existed since before this feature but had no real consumer anywhere in the codebase until now. As seeded today (`src/lib/billing/seed-plans.ts`): Free/Explore and Builder do **not** include publishing; Launch, Managed, and Agency do. This is real, existing pricing-tier data, not invented for this feature.

- **Publishing a new version** requires the organization's billing access level to be `"full"` (`src/lib/billing/access.ts`'s `getAccessLevel`) *and* the current plan's `deploymentAllowed` to be `true`. Both are checked by `assertPublishAllowed` (`src/lib/billing/entitlements.ts`).
- **An already-LIVE publication** is automatically suspended the moment the organization's billing access leaves `"full"` (`PAST_DUE`/`PAYMENT_RETRYING`/`GRACE_PERIOD` all remain `"full"` — suspension only follows the same grace-period exhaustion Master Spec §37 already defines for every other paid feature) and automatically restored the moment access returns to `"full"`. There is no separate grace period for publishing specifically; it follows the organization's one real billing state machine.
- Suspending public serving is **not** deleting customer data — the project, its `Blueprint`/`BuildPlan` history, and its `GeneratedRecord` data are all untouched. Only the public route stops serving.
- Export/data portability (`assertExportAllowed`) is deliberately unaffected by publish suspension — Master Spec §37 preserves data portability even while an organization is restricted.

## Public-route threat model

The public render route (`/p/{publicSlug}/{screen}`) is, by construction, unauthenticated and internet-reachable — a new exposure surface that did not exist before this feature (the pre-existing `/org/{orgSlug}/{projectSlug}/app/{screen}` route is also unauthenticated-until-signed-in, but requires knowing an internal org/project slug pair and always resolves "latest," neither of which is true here).

Mitigations, in the order a request encounters them:

1. **Uniform 404.** `resolvePublicationForRoute` (`src/lib/deployment/public-resolver.ts`) 404s identically for a slug that never existed, a `DRAFT`/`UNPUBLISHED`/`SUSPENDED`/`PUBLISH_FAILED` publication, and a real slug belonging to a project — a visitor probing slugs can never distinguish "never existed" from "exists but is not currently public."
2. **No org identity leak.** `publicSlug` is independent of the organization/project slug by design — the public URL never contains or implies an organization name.
3. **Version pinning.** The render route only ever queries the exact `publishedBlueprintVersion`/`publishedBuildPlanVersion` pair — never "latest" — so a draft edit never changes what a signed-out visitor sees until the project owner explicitly republishes.
4. **Server-side-only resolution.** The project is resolved exclusively from the request's own `publicSlug` path segment; no client-supplied `projectId` is ever accepted or trusted anywhere in the public route.
5. **Per-(publicSlug, IP) rate limiting.** `isPublicRouteRateLimited` (`src/lib/deployment/public-route-rate-limit.ts`) — the same DB-backed sliding-window pattern as login/submission rate limiting — caps requests per published app per visitor IP (`PUBLIC_ROUTE_RATE_LIMIT_MAX_ATTEMPTS`/`PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS`, defaults 120/60s), so one abusive visitor to one published app never throttles a different customer's app or a different visitor.
6. **No arbitrary code execution.** Because there is no compiled artifact (see Architecture above), there is no build step, no dependency install, and no way for generated content to execute anything beyond the closed, known set of component types the interpreter already renders for the authenticated preview — a real security advantage of the interpreted architecture over a hypothetical compile-and-host model, not incidental.
7. **Generated-app auth still applies.** Screens are gated by the generated app's own `GeneratedAppUser`/`GeneratedAppSession` mechanism exactly as the authenticated route already enforces it — publishing changes *how* the app is reached, never *whether* its own end-user auth requirement is honored.

Regression coverage: `e2e/publishing.spec.ts` (the full publish → view while signed-out → edit-doesn't-leak → republish → unpublish → restore proof) and `e2e/publishing-tenant-isolation.spec.ts` (a forged org/project slug on the *authenticated* publish action 404s gracefully, never revealing or modifying another tenant's project).

## Founder operations guide

- **No new external credential is required to reach a live public URL.** Publishing serves from Pocket Studio's own existing deployment; there is no per-customer hosting account to provision.
- **Custom domains are not implemented in this milestone.** Every published app is reachable only at its Pocket-Studio-assigned `/p/{publicSlug}` path today.
- **Plan configuration**: whether a workspace can publish is entirely a function of its plan's `deploymentAllowed` entitlement — no separate publishing-specific billing configuration exists to manage.
- **Nothing to back up beyond the existing database backup requirements** (`docs/DEPLOYMENT.md`) — publications are ordinary rows, not separate infrastructure state.
- **Rate limits are configurable** without a code change via `PUBLIC_ROUTE_RATE_LIMIT_MAX_ATTEMPTS`/`PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS` (`.env.example`), same pattern as the AI usage limits added earlier.

## Private-pilot boundary — explicitly in and out of scope

**In scope, implemented:**
- Publish, publish-an-update, unpublish, and restore-previous-version, all server-authoritative and billing-gated.
- One stable Pocket-Studio-assigned public URL per project (`/p/{publicSlug}/{screen}`), reusing Pocket Studio's own deployment — no separate hosting provider.
- Automatic suspend/restore tied to the organization's real billing state.
- Per-(app, visitor) rate limiting on the public route.

**Explicitly deferred, not started:**
- Native App Store / Play Store publishing.
- A real per-customer compiled source artifact or independent hosting account (would require a Blueprint/BuildPlan → real source code compiler, which does not exist anywhere in this codebase).
- Custom domains.
- Multiple environments per published app (staging/production).
- Background/async build jobs — none are needed under this architecture (publishing is a single synchronous DB transaction, not a build-and-deploy round trip).
