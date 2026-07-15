# Pocket Studio Official — Founder Testing Playbook

Companion to `POCKET_STUDIO_DEFINITIVE_FOUNDER_REPORT.md`. 50 numbered tests, clean install through deletion/retention. Each has prerequisites, exact steps, expected result, pass criteria, known limitation, and severity if it fails. Run them in order — later tests assume earlier setup.

## Required software

- Node.js (version matching `package.json`'s `engines`, if present — otherwise the latest LTS)
- Docker Desktop (for local Postgres via `docker-compose.yml`)
- A terminal
- A Chromium-based browser (Playwright installs its own; a regular browser is fine for manual steps)

## One-time setup

```
git clone <repo>
cd pocket-studio-official
npm install
cp .env.example .env
openssl rand -base64 48   # paste into .env as SESSION_SECRET
openssl rand -base64 32   # paste into .env as CREDENTIAL_ENCRYPTION_KEY
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Leave `AI_PROVIDER=mock`, `BILLING_PROVIDER=mock`, `EMAIL_PROVIDER=mock`, `GENERATED_APP_PAYMENT_PROVIDER=mock` for tests 1–40. Tests 41+ require real credentials, noted individually.

App runs at `http://localhost:3000`.

---

### Test 1 — Clean install and startup

**Prerequisites**: none beyond the one-time setup above.
**Steps**: run the setup commands exactly as listed; visit `http://localhost:3000`.
**Expected**: landing page renders with sign-in/sign-up links, no console errors.
**Pass criteria**: page loads, no 500 error, no unhandled exception in the terminal.
**Known limitation**: none.
**Severity if fails**: P0 — nothing else in this playbook is reachable.

### Test 2 — Database migration

**Steps**: `npm run db:migrate` from a fresh database.
**Expected**: all 28 migrations apply in order without error.
**Pass criteria**: command exits 0; `npm run db:studio` shows 44 tables.
**Severity if fails**: P0.

### Test 3 — Seed data

**Steps**: `npm run db:seed`.
**Expected**: "Seeding capability registry... Seeding plan registry... Seed complete."
**Pass criteria**: 22 Capability Registry rows, plan definitions present (verify via `db:studio` or the billing page in test 9).
**Severity if fails**: P0 — Truth Status and plan enforcement won't work.

### Test 4 — Sign-up

**Steps**: visit `/sign-up`; fill Name, Email, a password ≥ 8 characters; submit.
**Expected**: redirected to `/onboarding`.
**Pass criteria**: no error banner; a `Session` row exists for the new user.
**Known limitation**: none.
**Severity if fails**: P0.

### Test 5 — Sign-up validation

**Steps**: try submitting with a 7-character password.
**Expected**: rejected, form redisplayed with an error.
**Pass criteria**: password not accepted below the 8-character minimum.
**Severity if fails**: P1 (weak password policy would be a security gap).

### Test 6 — Sign-in

**Steps**: sign out; sign back in with the same credentials at `/sign-in`.
**Expected**: redirected to `/dashboard`.
**Pass criteria**: session re-established, dashboard shows the existing org.
**Severity if fails**: P0.

### Test 7 — Failed-login lockout

**Steps**: sign out; attempt sign-in with the wrong password 5 times; then attempt with the _correct_ password.
**Expected**: after 5 failures, the account locks; the 6th attempt (correct password) still fails with a lockout message.
**Pass criteria**: matches `e2e/login-rate-limit.spec.ts` behavior exactly.
**Severity if fails**: P0 (security).

### Test 8 — Organization creation (onboarding)

**Steps**: as a brand-new signed-up user, enter a workspace name at `/onboarding`.
**Expected**: redirected to `/dashboard`, org appears.
**Pass criteria**: `Organization` and `Membership` rows created.
**Severity if fails**: P0.

### Test 9 — Billing page, default plan

**Steps**: visit `/org/[orgSlug]/billing`.
**Expected**: shows plan key (Free/Explore), entitlements table with real usage (e.g., "0 / 1" projects).
**Pass criteria**: no "Live billing... not yet available" error under mock provider (that message only appears if no billing customer exists yet — expected on a brand-new org until a project/subscription action creates one).
**Known limitation**: no checkout/upgrade UI exists — you cannot purchase a plan through the interface.
**Severity if fails**: P1.

### Test 10 — Project creation

**Steps**: from `/org/[orgSlug]`, type a project name into the (unlabeled) text field and submit.
**Expected**: redirected into the new project's Simple Mode page.
**Pass criteria**: `Project` row created, scoped to the org.
**Known limitation**: the input has no `<label>` — a real, minor accessibility gap.
**Severity if fails**: P0.

### Test 11 — Idea entry (first submission)

**Steps**: on the empty project page, type: `Build a premium booking app for mobile detailers.` Submit.
**Expected**: page re-renders with a Product DNA-derived heading and target users.
**Pass criteria**: matches `e2e/official-demonstration.spec.ts`.
**Severity if fails**: P0.

### Test 12 — Idea validation (too short)

**Steps**: submit a 5-character idea.
**Expected**: redirected back with an error, and the exact typed text preserved in the field.
**Pass criteria**: no data loss on error.
**Severity if fails**: P2.

### Test 13 — Example idea picker (mouse)

**Steps**: on a fresh project's empty idea screen, click one of the example chips.
**Expected**: textarea populates, remains editable.
**Pass criteria**: matches `e2e/example-idea-picker.spec.ts`.
**Severity if fails**: P3.

### Test 14 — Example idea picker (keyboard)

**Steps**: Tab to a chip, press Enter.
**Expected**: same as test 13, via keyboard only.
**Pass criteria**: accessible without a mouse.
**Severity if fails**: P2 (accessibility).

### Test 15 — Consequential decision approval

**Steps**: submit a follow-up idea that implies something consequential (e.g., mentions payments); look for a "Needs your approval" card; click Approve.
**Expected**: decision resolves, Decision Ledger updates.
**Pass criteria**: matches `e2e/golden-path.spec.ts`.
**Severity if fails**: P0.

### Test 16 — Double-response protection

**Steps**: open the same project in two browser tabs; approve a pending decision in tab 1; then attempt to respond to the same decision in tab 2.
**Expected**: tab 2 shows a graceful error ("already responded to"), not a crash.
**Pass criteria**: matches `e2e/decision-double-response.spec.ts`.
**Severity if fails**: P1.

### Test 17 — Unit economics editing

**Steps**: edit one field in the Business panel's unit-economics form; save; reload the page.
**Expected**: the edited field persists; other fields are untouched.
**Pass criteria**: matches `e2e/golden-path.spec.ts`'s field-level assertion.
**Severity if fails**: P1.

### Test 18 — Generate app

**Steps**: click "Generate app."
**Expected**: Build Plan appears with status Ready/Blocked and per-screen "Preview" links.
**Pass criteria**: for the exact test 11 sentence, expect exactly two screens: Home, Browse.
**Known limitation**: this is far narrower than Master Spec §56's 11-screen illustrative example — expected, not a bug.
**Severity if fails**: P0.

### Test 19 — Live preview screen

**Steps**: click "Preview: Home."
**Expected**: a real rendered screen, e.g. an empty state reading "No Record records yet." sourced from a real (empty) database query.
**Pass criteria**: matches `e2e/generation-preview.spec.ts`.
**Known limitation**: reachable only by your own founder session — there is no separate URL a real end customer could visit.
**Severity if fails**: P0.

### Test 20 — Quality Gate

**Steps**: click "Run Quality Gate."
**Expected**: a Truth Status entry appears reflecting pass/fail across the 11 structural/behavioral/accessibility/governance/operational checks.
**Pass criteria**: no crash; result is recorded.
**Known limitation**: checks are structural/server-side only — no real browser run, no live authz fuzzing.
**Severity if fails**: P1.

### Test 21 — Store readiness assessment

**Steps**: click "Assess store readiness."
**Expected**: a rationale listing blockers (e.g., "Apple/Google developer account connected: no").
**Pass criteria**: matches `e2e/launch-actions.spec.ts`.
**Known limitation**: this build can never report "ready" — by design, not a bug.
**Severity if fails**: P2.

### Test 22 — Generate mobile project

**Steps**: click "Generate mobile project."
**Expected**: a Truth Status entry with an honest "no native build" rationale.
**Pass criteria**: no crash; entry recorded.
**Known limitation**: produces a 4-file static Expo scaffold, not a working mobile app.
**Severity if fails**: P2.

### Test 23 — Legal draft generation

**Steps**: click "Generate draft" for Terms of Service.
**Expected**: draft appears with bracketed placeholders for unknowable facts (company name, jurisdiction) and a "not legal advice" notice; button relabels to "Regenerate draft."
**Pass criteria**: matches `e2e/launch-actions.spec.ts`.
**Known limitation**: only 3 of 13 document types have real generators (ToS, Privacy Policy, AI Disclosure).
**Severity if fails**: P2.

### Test 24 — Export

**Steps**: click "Export project" (or fetch the export URL directly).
**Expected**: a JSON file downloads containing Product State/DNA, Blueprint, Build Plan, generated records, policy docs, Truth Status.
**Pass criteria**: valid JSON, includes a `disclosures` field stating it is not deployable code or a database backup.
**Severity if fails**: P1.

### Test 25 — Export entitlement gating

**Steps**: on a Free/Explore-plan org, attempt export again after test 24 if the plan doesn't include it, or check the response code directly.
**Expected**: 403 with a plan-limit reason if export isn't included in the plan.
**Pass criteria**: matches `e2e/launch-actions.spec.ts`'s assertion.
**Severity if fails**: P1 (billing enforcement).

### Test 26 — Conversational follow-up edit

**Steps**: submit: `Add appointment deposits, monthly maintenance memberships, and recurring appointments.`
**Expected**: impact analysis runs; if the new requirement introduces a new category, the entire Blueprint/Build Plan regenerates; a new version is recorded either way.
**Pass criteria**: no crash; Versions list grows.
**Known limitation**: regeneration is category-level, not field/screen-level.
**Severity if fails**: P0.

### Test 27 — Version history

**Steps**: open the Versions section.
**Expected**: chronological list of Product State/Blueprint/Build Plan/Change Set versions.
**Pass criteria**: entries present and in order.
**Severity if fails**: P1.

### Test 28 — Blueprint restore

**Steps**: click Restore on an earlier Blueprint version.
**Expected**: a new top version is created matching the restored content (append-only, never mutates history).
**Pass criteria**: screens/data models match the restored version.
**Known limitation**: no diff preview shown before restoring; Product State and Build Plan restore are not implemented.
**Severity if fails**: P1.

### Test 29 — Restore the newer version again

**Steps**: restore forward to the version created in test 26.
**Expected**: same as test 28, in the other direction.
**Pass criteria**: content matches.
**Severity if fails**: P1.

### Test 30 — Simple → Expert Mode switch

**Steps**: click into Expert Mode from the project page.
**Expected**: 4 read-only panels — Product State versions, Truth Status, Decision Ledger, Event Ledger.
**Pass criteria**: same Product State version count and event log as Simple Mode.
**Known limitation**: no forms, no actions — you cannot approve a decision from here.
**Severity if fails**: P2.

### Test 31 — Expert → Simple Mode switch back

**Steps**: return to Simple Mode.
**Expected**: all data intact, no drift.
**Pass criteria**: matches `e2e/golden-path.spec.ts`.
**Severity if fails**: P1.

### Test 32 — Session persistence across sign-out/sign-in

**Steps**: sign out; sign back in; revisit the project.
**Expected**: all state (ideas, decisions, versions) intact.
**Pass criteria**: matches `e2e/golden-path.spec.ts`.
**Severity if fails**: P0.

### Test 33 — Cross-tenant isolation (forged org slug)

**Steps**: as user A, open dev tools, use `page.evaluate`-style forgery (or manually edit the hidden `organizationSlug` field) to point a project-creation request at user B's org.
**Expected**: graceful redirect to `/dashboard`, no crash, no project created in B's org.
**Pass criteria**: matches `e2e/tenant-isolation.spec.ts`.
**Severity if fails**: **P0 — security.**

### Test 34 — Expired session on a Server Action

**Steps**: clear the session cookie mid-session; submit the idea form.
**Expected**: graceful redirect to `/sign-in`, not a 500.
**Pass criteria**: matches `e2e/auth-guard.spec.ts`.
**Severity if fails**: P1.

### Test 35 — Unauthenticated access to protected routes

**Steps**: without signing in, visit `/dashboard`, `/onboarding`, `/org/anything`.
**Expected**: redirected to `/sign-in`.
**Pass criteria**: no 500, no data leak.
**Severity if fails**: P0.

### Test 36 — PWA manifest and service worker

**Steps**: open a preview screen; check dev tools' Application tab for a registered service worker; fetch `manifest.webmanifest` directly.
**Expected**: real manifest JSON; service worker registers.
**Pass criteria**: matches `e2e/pwa-output.spec.ts`.
**Known limitation**: no offline caching.
**Severity if fails**: P2.

### Test 37 — Billing usage / plan limit enforcement

**Steps**: on a Free/Explore org already at its project limit, attempt to create a second project.
**Expected**: rejected gracefully with a real reason.
**Pass criteria**: matches `e2e/billing-usage.spec.ts`.
**Severity if fails**: P1.

### Test 38 — Stripe webhook rejection paths (mock/direct POST)

**Steps**: `curl -X POST http://localhost:3000/api/webhooks/stripe` with no signature header; with a malformed body; with a well-formed event for an unrecognized customer.
**Expected**: each rejected gracefully (400/200-acknowledged-but-ignored as appropriate), never a crash page.
**Pass criteria**: matches `e2e/billing-webhook.spec.ts`.
**Severity if fails**: P1.

### Test 39 — OAuth callback rejection paths

**Steps**: `curl` the callback route unauthenticated; then authenticated with a missing `state`; then authenticated with an unknown `state`.
**Expected**: 401, then 400, then 400 — never a crash.
**Pass criteria**: matches `e2e/oauth-callback.spec.ts`.
**Known limitation**: there is no UI entry point to begin a real OAuth connection — this only tests the callback's own defenses.
**Severity if fails**: P1 (security).

### Test 40 — Full automated suite

**Steps**: `npx tsc --noEmit && npx eslint . --max-warnings=0 && npx prettier --check . && npx vitest run && npx playwright test`.
**Expected**: all clean/passing.
**Pass criteria**: typecheck/lint/format clean; 678/678 unit+integration; 24/24 e2e.
**Severity if fails**: P0 — indicates a regression from the state this report verified.

---

The remaining tests require real credentials. Set only the ones needed per test; leave others on `mock`.

### Test 41 — Real AI provider

**Prerequisites**: a real `ANTHROPIC_API_KEY`.
**Steps**: set `AI_PROVIDER=anthropic` and the key; restart the dev server; repeat test 11.
**Expected**: intent resolution now runs against the real Anthropic API with forced structured tool output.
**Pass criteria**: no crash; a real `AiUsageEvent` row with real token counts is recorded.
**Known limitation**: no dollar cost is estimated unless you also set `AI_COST_PER_1K_INPUT_TOKENS_CENTS`/`OUTPUT`.
**Severity if fails**: P1.

### Test 42 — Real Stripe billing portal

**Prerequisites**: a Stripe test-mode account, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
**Steps**: set `BILLING_PROVIDER=stripe`; restart; click "Manage billing" on the billing page.
**Expected**: redirected to a real Stripe-hosted portal session.
**Pass criteria**: portal loads without error.
**Severity if fails**: P1.

### Test 43 — Real Stripe webhook — healthy renewal (the fixed CRITICAL DEFECT scenario)

**Prerequisites**: test 42's setup, plus the Stripe CLI (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`).
**Steps**: with a subscription already `ACTIVE`, trigger `stripe trigger invoice.payment_succeeded`.
**Expected**: processed as a safe no-op — no crash, no invalid-transition error.
**Pass criteria**: this is the exact scenario the round-1 CRITICAL DEFECT covered; confirm it no longer throws.
**Severity if fails**: **P0 — this is the highest-severity regression this playbook can catch.**

### Test 44 — Real Stripe failed-payment flow

**Steps**: use a Stripe test card that fails; observe the state machine move through past_due → grace period → restriction.
**Expected**: matches Master Spec §37's defined workflow; customer-owned infrastructure (i.e., anything outside Pocket Studio's own DB) remains unaffected — trivially true today since no deployment provider exists to affect.
**Pass criteria**: state transitions recorded, notification path exercised (email, if also configured).
**Severity if fails**: P0.

### Test 45 — Real SMTP email

**Prerequisites**: `EMAIL_PROVIDER=smtp` and all 5 SMTP env vars, pointed at a real inbox.
**Steps**: trigger a real signup or notification email.
**Expected**: email arrives, correctly formatted.
**Pass criteria**: `SentEmail` row recorded; real inbox delivery confirmed.
**Severity if fails**: P1.

### Test 46 — Real customer-owned OAuth connection

**Prerequisites**: a real OAuth provider registered in `oauth-provider-registry.ts` (requires new engineering — none is registered today) plus real provider credentials.
**Steps**: not currently possible without first doing the registration work.
**Expected/Pass criteria**: N/A until a provider is registered.
**Severity if fails**: N/A — currently blocked at the prerequisite stage; treat as an open item, not a failing test.

### Test 47 — Mobile native build

**Prerequisites**: Xcode and/or Android SDK, a real Expo/EAS account.
**Steps**: attempt to build the generated Expo scaffold from test 22 into a real `.ipa`/`.apk`.
**Expected/Pass criteria**: not supported by this build today — expect this to require substantial manual work outside anything Pocket Studio generates.
**Severity if fails**: N/A — known unsupported, not a regression.

### Test 48 — Store submission

**Prerequisites**: real Apple Developer / Google Play Console accounts.
**Steps**: attempt to submit the generated mobile project.
**Expected/Pass criteria**: no path exists in the product to do this today.
**Severity if fails**: N/A — known unimplemented.

### Test 49 — Deployment to production hosting

**Prerequisites**: none exist — no real `DeploymentProvider` is implemented.
**Steps**: attempt to deploy a generated app to a live URL.
**Expected/Pass criteria**: not possible today.
**Severity if fails**: N/A — known unimplemented; this is the top engineering gap before paid pilot.

### Test 50 — Retention and deletion behavior

**Prerequisites**: a subscription moved (via mock or real Stripe test events) through CANCELED → RETENTION_PERIOD → DELETED.
**Steps**: after reaching `DELETION_EXECUTED`, query the database directly for the org's `Project`, `IntegrationRequirement`, `CredentialReference`, and `GeneratedRecord` rows.
**Expected**: per Master Spec §37's intent, one would expect these to be gone or anonymized.
**Actual/pass criteria — read carefully**: **all of these rows remain completely untouched.** This is confirmed by `customer-data-protection.integration.test.ts` and is the single highest-priority known limitation in this report. Do not treat this test as "passing" if it matches current behavior — it is documenting a real gap, not confirming correct behavior.
**Severity if this remains true**: **P0 — must be resolved before any real customer is told their data is deleted.**
