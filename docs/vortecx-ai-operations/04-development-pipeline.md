# Development Pipeline

## Today (proven — this is literally how this session's work happened)

```
Founder states an objective
        │
        ▼
Claude Code inspects repo + governance docs, states the specific blocker
and the evidence it's real (never assumed)
        │
        ▼
Claude Code designs the smallest complete solution, implements it
        │
        ▼
Local verification, in order:
  1. npx tsc --noEmit         (typecheck)
  2. npx vitest run <scoped>  (targeted tests for the change)
  3. npx vitest run           (full suite regression — 108 files / 808 tests
                                as of this session)
  4. npx eslint .             (lint)
  5. npx prettier --check .   (format)
  6. npx next build           (production build)
        │
        ▼
Browser-verify the actual affected journey (Claude in Chrome) when the
change has a live user-facing surface
        │
        ▼
git commit (Decision Ledger + Evidence Ledger entries for anything
consequential), git push to main directly — there is no PR/branch
workflow in use today
```

**Verified gap**: there is no CI. `.github/` does not exist in this repository (checked directly). Every one of the six verification steps above runs locally, manually, once per change — nothing re-runs them automatically on push, and nothing blocks a push if they were skipped. This is the single most impactful, lowest-risk automation opportunity in this pipeline: it requires no new infrastructure, no new tool, and no cost — only a workflow file.

## Proposed near-term (no new infrastructure required)

Add `.github/workflows/validate.yml` running `npm run validate` (already exists as a single script combining typecheck/lint/format/test — `package.json`) on every push and pull request. This closes the verified gap above using GitHub Actions, which needs no VPS, no Coolify, and no new agent — it is the correct next step before any of the heavier infrastructure in `10-infrastructure-roadmap.md`. **Not implemented in this pass** — this document set was scoped to design and documentation only, per the founder's explicit instruction not to alter Pocket Studio's repository beyond the documentation itself.

## Proposed target (once Coolify exists — see roadmap)

```
Founder objective
        │
        ▼
Claude Code plans + implements (unchanged)
        │
        ▼
GitHub Actions: typecheck / lint / format / unit+integration / e2e
        │  (blocks merge on failure — new, was previously optional/manual)
        ▼
Independent Reviewer subagent (unchanged, proven)
        │
        ▼
Claude in Chrome verifies the affected journey against a real Coolify
staging deployment (new — today this runs against local dev only)
        │
        ▼
Merge to main → Coolify auto-deploys staging (new)
        │
        ▼
Founder explicit approval required            ◀── unchanged rule: no
        │                                          production deploy
        ▼                                          without this
Coolify deploys production, records deployment evidence (new)
```

The founder-approval gate before production is not new policy invented for this document — it restates the operating rule already given for this session verbatim ("Never deploy to production without explicit approval").
