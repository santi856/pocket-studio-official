# Release Process

## Today (verified)

There is no release process, because there is no deployment target. This is not an oversight this document is inventing a fix for — it is a disclosed, already-recorded known limitation in Pocket Studio's own ledger: `execution/state.json`'s `requiredCustomerActions` lists "Choose and implement a real hosting/deployment provider... no DeploymentProvider implementation exists today, mock only, no vendor is named anywhere in the Master Spec" and separately "no real StoreReviewProvider exists" for mobile distribution.

What exists today: commits go directly to `main` on `origin` (`github.com/santi856/pocket-studio-official`), verified locally (see `04-development-pipeline.md`), with no staging environment, no production environment, and no automated deploy step of any kind.

## Proposed target process — PROPOSED FUTURE STANDARD

Once Coolify exists on a dedicated host (`10-infrastructure-roadmap.md`):

1. **Staging is continuous.** Every push to `main` that passes CI (proposed) auto-deploys to a staging environment. No approval gate — staging is explicitly low-stakes.
2. **A release is a deliberate, named action**, not an automatic consequence of merging. A release candidate is staging's current state, tagged.
3. **Production requires the founder's explicit, per-release approval.** This is a restatement of the founder's own stated rule ("no production deployment without explicit approval"), not new policy — it is load-bearing enough to repeat here as the actual release gate, not just a general principle.
4. **Every production release records deployment evidence** — what was deployed, when, by what approval, and a rollback point — mirroring the Decision/Evidence Ledger pattern already proven in `execution/decisions/ledger.jsonl` / `execution/evidence/ledger.jsonl`, applied to infrastructure events instead of code decisions.
5. **Rollback is a first-class, tested action**, not an emergency improvisation — Coolify supports this natively; it should be exercised at least once against staging before it is ever relied on against production.

## What "ready to release" means, restated from the Master Spec

Adapted from Master Spec §68 (Controlled Commercial Launch Criteria), which this session's Official V1 Acceptance Test report already applied directly to Pocket Studio: a release is not ready merely because a checklist is checked. It requires the acceptance test passing within supported scope, no unresolved critical defect, known limitations disclosed, Truth Status accurate, and required customer/founder actions explicitly listed — exactly the structure `execution/final-audit/OFFICIAL_V1_ACCEPTANCE_TEST_EXECUTION_REPORT.md` already follows.

## Cross-project note

This process is intentionally infrastructure-first and vendor-agnostic in its gating logic (CI green → staging → founder approval → production) so Lucrio can adopt the same shape once it has its own CI, regardless of whether it ends up on the same Coolify host as Pocket Studio or a separate one.
