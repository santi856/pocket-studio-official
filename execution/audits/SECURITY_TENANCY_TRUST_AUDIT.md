# Security, Privacy, Tenancy, and Trust Audit — Pre-Phase-3 Forensic Audit (Part 6)

Distinguishes IMPLEMENTED / TESTED / LOCALLY VERIFIED from EXTERNAL REVIEW REQUIRED / PRODUCTION-HARDENING REQUIRED throughout. No claim of certification, compliance, or production security readiness is made anywhere in this document.

## Authentication and session handling — IMPLEMENTED, TESTED, LOCALLY VERIFIED

`src/lib/services/users.ts`, `src/lib/auth/session.ts`, `src/lib/auth/cookies.ts`. Password hashing real (not plaintext, not reversible-encoded); session tokens are real DB-backed rows (`Session` model), not JWTs holding trust client-side. Live-verified this session: sign-up → session cookie → protected-page access, and (from the uncommitted repair) an **expired-session negative test**: clearing the session cookie mid-flow and attempting a Server Action now redirects to `/sign-in` (via `requireCurrentUserForAction`) instead of crashing to a raw error page — confirmed by deliberately reverting the fix, reproducing the crash, then confirming the fix resolves it (documented in the parent session's D-0040).

## Authorization / tenant isolation — IMPLEMENTED, TESTED, LOCALLY VERIFIED

Single choke point: `src/lib/tenancy/authz.ts`'s `requireOrganizationMembership`/`requireProjectAccess`. Read directly: **resolves a project's own `organizationId` server-side first**, then checks the caller's real membership against _that_ — never trusts a client-supplied organization id for authorization purposes. This is the correct architecture (server-derived authority, not client-asserted).

Live-verified this session via a real browser (`tenant-isolation.spec.ts`, passing): a forged `organizationSlug` on project creation fails gracefully (redirect, no crash, no row created), not merely blocked-and-logged.

Cross-tenant reads/writes are additionally covered by dozens of integration tests across nearly every service file in `src/lib`, each asserting `ForbiddenError` for an outsider actor — a consistent, repeated pattern, not a one-off check. I did not attempt to construct a _novel_ bypass beyond what the existing test suite already covers (e.g., a raw SQL injection attempt, a GraphQL-style batched-query bypass) — this codebase has no raw SQL string-building anywhere I found (Prisma's typed query builder is used throughout), which structurally rules out classic SQL injection, but this claim is based on code-pattern inspection, not a dedicated fuzzing pass.

**Not verified this session**: whether every _single_ one of the ~76 service files without exception calls the choke point before touching data (I spot-checked a representative sample across P1 and P2 systems rather than reading all 76 files line-by-line). This is a real scope limitation of this audit pass, not a claim that a gap was found.

## Generated-app boundaries — LOCALLY VERIFIED, narrow

`GeneratedAppUser`/`GeneratedRecord` queries are always scoped by `projectId` (confirmed in `generated-records.ts`), meaning cross-_project_ generated-app data leakage is structurally prevented the same way platform data is. However, as noted in Part 4/5, generated-app end users have **no real session mechanism of their own** — the "generated-app boundary" that exists today is really "Pocket-Studio-builder-previewing-their-own-project," not "the generated product's own real customers, authenticated as themselves." This materially limits what security claims can be made about the _generated product's own_ runtime security, since that runtime (a real customer-facing login/session flow) doesn't exist yet.

## Credential encryption — IMPLEMENTED, real cryptography, one real gap

`src/lib/credentials/crypto.ts`, read directly:

- Algorithm: AES-256-GCM (`ALGORITHM = "aes-256-gcm"`).
- IV: fresh `randomBytes(12)` per call, **never caller-supplied** — the function signature does not accept an IV parameter, so IV reuse (which would break GCM's confidentiality guarantee) is structurally impossible from this code path.
- Auth tag: real `cipher.getAuthTag()`/`decipher.setAuthTag()` — tamper-evidence is genuine, not simulated.
- Key: `CREDENTIAL_ENCRYPTION_KEY` from `getServerEnv()`, a `server-only`-guarded module.
- Ciphertext/IV/authTag are stored as three separate base64 fields (`CredentialReference` model) — not concatenated into one opaque blob, which is good practice for auditability.

**Real gap: no key rotation mechanism.** A single static key from environment configuration; rotating it would silently break decryption of every existing `CredentialReference` row, since there is no key-versioning field on the model and no re-encryption migration path. This is a genuine production-hardening requirement, not a Phase-2-scope defect — Phase 2 never claimed key rotation.

## Logging / error leakage — PARTIALLY VERIFIED

D-0018/D-0020 (Phase 1) and this session's repair (D-0040) both specifically targeted "crash to Next.js's raw error page" as a defect class and fixed multiple real instances of it. This suggests the team is alert to error-leakage risk. I did not perform a full audit of every `console.error`/logged exception for accidental secret inclusion (e.g., does any log statement ever print a raw credential or password?) — spot check of `crypto.ts`/`vault.ts`/`users.ts` found no such logging, but this was not exhaustive across all 76 files.

## Input/output validation — IMPLEMENTED where checked

Component Registry uses real Zod validation (`component-registry.ts`) with fail-safe substitution on unrecognized types. Blueprint validation (`blueprint-validation.ts`) is real structural validation, not merely presence-checking. Server Actions consistently extract `FormData` fields defensively (`String(formData.get(...) ?? "")`) rather than trusting shape.

## Prompt-injection / generated-code trust boundaries — LARGELY N/A TODAY, REAL PHASE-3 RISK

Because Product Intelligence is `MockAIProvider`-backed (deterministic, no live model call), there is currently no live prompt for a malicious customer input to inject into — this entire risk category is dormant, not mitigated. **This is the single most important Phase-3-readiness security consideration**: the moment a live AI provider is wired in (Phase 3's own stated scope), prompt-injection and generated-code trust boundaries become live, real attack surface that this codebase has never had to defend against, because it has never had a live model to attack. No mitigation code (input sanitization specific to LLM prompts, output-parsing hardening, tool-use permission scoping) exists anywhere, because none has been needed yet.

## Destructive actions / consequential decisions — IMPLEMENTED, TESTED

Confirmed via direct code read and live tests: a `consequential_decision`-classified interaction state (e.g. payment confirmation) is never silently treated as approved — it blocks `BuildPlan.planStatus` (`computeBlockers` in `build-planner.ts`) and blocks full-pipeline generation (`generateApplication` returns `BLOCKED`, verified via an existing integration test). As noted in Part 4, however, there is no _approval mechanism_ for this specific class of consequential decision — it can be disclosed and it can block, but nothing in the codebase lets a customer say "yes, I approve this interaction-contract-level consequential decision" the way the separate `Decision`/`ChangeSet` approval flow works for edits. It is permanently blocked, not resolvably blocked, for the interaction-contract layer specifically.

## Billing/entitlement authority — SCAFFOLDED, not production-relevant yet

Real state-machine code exists; no live payment provider is wired, so there is no live billing authority to test negatively against. Not evaluated further this audit since there is no live attack surface here today.

## Audit trails / deletion / retention / export — PARTIALLY IMPLEMENTED

Event Ledger (`ProductEvent`) and Evidence Ledger (`ProductEvidence`) are real, append-only, and genuinely comprehensive across the systems inspected this session. **No explicit data-deletion or retention-policy enforcement code was found** (`grep -rn "delete\|retention" src/lib/product` surfaces mostly the append-only-ledger discipline itself, not a customer-initiated "delete my data" flow) — export exists (Part 5), deletion does not appear to.

## Overall security/tenancy classification

| Control                                                      | Status                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Session-based auth                                           | Implemented, tested, locally verified                                                                                  |
| Tenant isolation choke point                                 | Implemented, tested, locally verified (representative sample, not exhaustive)                                          |
| Credential encryption (AES-256-GCM)                          | Implemented, real cryptography                                                                                         |
| Credential key rotation                                      | **Absent — production-hardening required**                                                                             |
| Generated-app end-user sessions                              | **Absent — a real gap, not just a limitation**                                                                         |
| Consequential-decision blocking                              | Implemented, tested                                                                                                    |
| Consequential-decision approval (interaction-contract layer) | **Absent**                                                                                                             |
| Prompt-injection defense                                     | **N/A today, will be required the moment Phase 3 wires a live AI provider**                                            |
| Data deletion/retention enforcement                          | **Not found — external/production review required**                                                                    |
| Any external security/penetration review                     | **Never performed — explicitly required before any real production claim, per this project's own Review Protocol §10** |

No finding in this section rises to a level that should, by itself, prevent starting Phase 3 planning — but the credential-key-rotation gap and the complete absence of prompt-injection defense are both directly relevant to Phase 3's own stated scope (real AI provider connections, real credentials) and should be named, tracked blockers for whatever Phase 3 unit first turns on a live provider or handles a real, unrotatable production key.
