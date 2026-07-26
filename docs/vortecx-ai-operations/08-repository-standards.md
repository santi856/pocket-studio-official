# Repository Standards

## Already enforced in Pocket Studio (verified, not proposed)

- **Stack**: Next.js App Router, strict TypeScript, Tailwind CSS, Prisma + Postgres via `@prisma/adapter-pg`, Zod for validation — recorded as a deliberate decision in the Decision Ledger (`D-0001`), not an unstated convention.
- **Test co-location**: `*.test.ts` / `*.integration.test.ts` files live beside the source they test (e.g. `src/lib/billing/account-deletion.ts` + `src/lib/billing/account-deletion.integration.test.ts`), not in a separate top-level test tree.
- **Validation is one command**: `npm run validate` runs typecheck → lint → format:check → test, in that order. Any contribution should pass this locally before commit — today this is a discipline, not an enforced gate (see the CI gap in `04-development-pipeline.md`).
- **Tenant isolation is mechanically checked, not just reviewed**: `src/lib/tenancy/verify-tenant-isolation.ts` statically scans every tenant-scoped function; exceptions require an individually-justified entry in a small, explicit allow-list (`ALLOWED_EXCEPTIONS`), and the exact allow-list is itself asserted by a test (`verify-tenant-isolation.test.ts`) so a new exception can never be added silently.
- **Governance-as-code**: `execution/state.json`, `execution/decisions/ledger.jsonl`, `execution/evidence/ledger.jsonl` are append-only, machine-readable records, checked into the same repository as the code they govern — not an external wiki or ticket system that can drift out of sync.
- **Underscore-prefix convention for intentionally-unused values**: enforced by ESLint config (`@typescript-eslint/no-unused-vars` with `argsIgnorePattern: "^_"`), for the common case of an unimplemented interface method's unused parameter.

## Verified gaps (real, not invented)

- **No CI** — `.github/` does not exist. See `04-development-pipeline.md` for the specific, low-cost fix.
- **No branch/PR workflow** — commits go directly to `main`. Whether to adopt one is a process decision for the founder, not assumed here; noted as a gap, not silently corrected.
- **e2e tests are not part of `npm run validate`** — `test:e2e` is a separate script, easy to forget to run.
- **Duplicate local repository checkouts observed across projects**: Pocket Studio had `.claude/worktrees/` containing full stale duplicate checkouts (cleaned up this session — excluded from lint, confirmed harmless, left in place as they're gitignored); Lucrio independently has the same pattern (`lucrio-ba5f26e3` and `lucrio-remote-fix`, two local checkouts of one remote, different commits each). This is worth a standing convention: **stale worktree checkouts should be identified and either merged or removed on a regular cadence**, since they were independently found causing the same class of problem (wasted lint time, developer confusion about which copy is current) on two separate projects.

## Proposed additions — PROPOSED FUTURE STANDARD

- **A `.github/workflows/validate.yml`** running `npm run validate` and `npm run test:e2e` on every push/PR (see `04-development-pipeline.md`) — the single highest-value, zero-cost repository standard missing today.
- **Adopt the same Decision/Evidence Ledger pattern in Lucrio**, even before Lucrio has Pocket Studio's full three-document governance system — the ledger format itself (`decisionId`, `recommendation`, `alternatives`, `reason`, `impact`, `risk`, `evidence`) is project-agnostic and does not require the rest of the Master Spec/Execution Protocol/Review Protocol to already exist to start being useful.
- **A `CODEOWNERS`-equivalent or explicit escalation list**, once more than one human is involved, so "founder decision required" has an unambiguous recipient.

## What this document deliberately does not do

It does not invent linting rules, commit-message conventions, or branch-naming schemes that Pocket Studio does not already have — where no convention was found, none is claimed.
