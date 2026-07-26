# Deployment Guide

Status as of 2026-07-26: **no staging or production deployment exists yet.** This document prepares the repository side of that gap — recommendation, environment variables, migration/rollback/backup procedure — for when hosting is provisioned. See `execution/final-audit/` for the live audit that produced this document's recommendations.

## Environment variables

All server env vars are validated by `src/lib/env.ts`'s Zod schema at startup — a missing or malformed required value fails loudly rather than silently defaulting. See `.env.example` for the full list with inline explanations. Summarized here as required vs. optional:

### Required in every environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Min 32 characters — platform session integrity |
| `CREDENTIAL_ENCRYPTION_KEY` | Base64, must decode to exactly 32 bytes — AES-256-GCM key for the customer credential vault. Generate with `openssl rand -base64 32`. **Losing this key makes every stored customer credential permanently unrecoverable — back it up outside the database.** |

### Required only for integration tests

| Variable | Purpose |
|---|---|
| `TEST_DATABASE_URL` | A second, separate Postgres database — tests never run against `DATABASE_URL`'s data |

### Optional — each defaults to a deterministic mock provider until configured

| Variable | Unlocks |
|---|---|
| `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | Real AI-backed generation instead of the mock provider |
| `BILLING_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Real billing portal + webhooks — **note**: no real Stripe Checkout session creation exists in this codebase yet (see the audit); these credentials alone do not yet let a real customer subscribe |
| `EMAIL_PROVIDER=smtp` + `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`/`EMAIL_FROM_ADDRESS` | Real transactional email (currently only a welcome email exists — no password-reset or verification email exists to send yet) |
| `AI_COST_PER_1K_INPUT_TOKENS_CENTS` / `AI_COST_PER_1K_OUTPUT_TOKENS_CENTS` | Converts recorded token usage into an estimated dollar cost. **Does not cap or throttle spend** — see the audit's AI-cost-and-abuse findings |
| `IMPACT_ANALYSIS_MODE=graph` | Enables the newer graph-based impact analysis for conversational edits (default `keyword`) |
| `GENERATED_APP_PAYMENT_PROVIDER` | Always `mock` today — a real charge always uses the customer's own connected payment account (OAuth), and the OAuth provider registry is currently empty, so this has no real-mode toggle to set yet |

**Never commit `.env`.** It is gitignored; only `.env.example` (placeholder values) is tracked.

## Startup

- Build: `npm run build`
- Start: `npm run start` (reads `PORT`, defaults to 3000)
- Migrations: `npm run db:deploy` (`prisma migrate deploy` — safe for a running environment, never resets data) must run before `npm run start` on every deploy that includes new migrations
- Health check: `GET /api/health` — returns `{"status":"ok","database":"reachable"}` (200) or `{"status":"error","database":"unreachable"}` (503). Confirmed real (queries the database directly, not a static response) as part of this audit.

## Rollback procedure

No deployment exists yet to have a tested rollback procedure. Once one does (see the infrastructure recommendation below), the procedure is:

1. Redeploy the previous known-good commit/build artifact — do this before touching the database.
2. Only run `npm run db:deploy` forward — this codebase's migrations are additive by convention (verified in this audit: no destructive migration pattern was found in `prisma/migrations/`). Rolling the database schema itself backward is not a supported or tested path here; if a migration must be undone, write and review a new forward migration that reverses it, the same discipline already enforced by `src/lib/db-safety/verify-migration-safety.ts`'s destructive-pattern analyzer.
3. Verify `/api/health` and the golden-path e2e journey (`e2e/golden-path.spec.ts`) pass against the rolled-back deployment before considering the rollback complete.

## Migration procedure

1. `npx prisma migrate dev --name <description>` locally to generate the migration file, verified against your local dev database.
2. Commit the generated `prisma/migrations/<timestamp>_<description>/migration.sql`.
3. CI (`.github/workflows/validate.yml`) applies it via `prisma migrate deploy` against a fresh database as part of every push/PR — a migration that doesn't apply cleanly to an empty database fails CI before merge.
4. On deploy, `npm run db:deploy` applies any pending migrations before the new build starts serving traffic.

## Backup requirements

**No backup mechanism exists anywhere in this codebase today** (confirmed in this audit — no scheduled job, no cron config, no backup script). Before any real customer data exists:

- Enable your hosting/database provider's own automated backup feature (e.g., a managed Postgres provider's daily snapshot) — this is an infrastructure decision, not something this repository can configure for you.
- `CREDENTIAL_ENCRYPTION_KEY` must be backed up separately from the database it protects — a database backup without the matching key is unrecoverable ciphertext.

## Founder credential setup (no secret values recorded here)

To move from mock providers to real ones, you will need, in your own secrets manager or hosting provider's environment-variable UI (never in this repository):

1. An Anthropic API key, if enabling real AI generation.
2. A Stripe secret key and webhook signing secret, if enabling real billing (with the checkout-flow caveat above).
3. Real SMTP credentials from any standard provider, if enabling real transactional email.
4. A freshly generated `SESSION_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` — generate these once per environment (dev/staging/production should each have their own, never shared) and store them only in your hosting provider's secrets configuration.
