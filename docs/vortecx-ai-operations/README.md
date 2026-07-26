# Vortecx Labs AI Engineering Operations

Status: **design deliverables — not yet implemented as infrastructure.** Everything in this directory is a proposed operating model for Vortecx Labs' AI-driven engineering, grounded in the Pocket Studio repository's own governance system and real, current operational state. It does not describe anything installed or running beyond what Pocket Studio itself already has.

Written 2026-07-26, against Pocket Studio commit `7495f02`.

## Scope and honesty rules this document set follows

- Every claim about Pocket Studio is verified against this repository as it exists today, not assumed.
- Every recommendation is one of three kinds, and is labeled as such wherever it might be ambiguous:
  - **Proven** — already working in Pocket Studio, evidenced by its own governance docs, ledgers, or a live-verified session.
  - **Verified gap** — a real, checked-for-absence in this repository (e.g., no CI configuration exists — confirmed by `ls .github` returning nothing).
  - **Proposed future standard** — not yet built anywhere; a recommendation for what Vortecx Labs should adopt next, clearly marked as not-yet-real.
- No new software has been installed to produce these documents. Docker, GitHub CLI, and Playwright are already present on this machine (verified); OpenHands, Langflow, Coolify, Open WebUI, and Maxun are not installed anywhere (verified) and nothing here assumes otherwise.

## Reading order

1. [`01-organization-chart.md`](01-organization-chart.md) — who (human and AI) does what, today vs. proposed.
2. [`02-engineering-handbook.md`](02-engineering-handbook.md) — the operating principles, generalized from Pocket Studio's own Master Spec / Execution Protocol / Review Protocol.
3. [`03-agent-roles-and-authority.md`](03-agent-roles-and-authority.md) — per-agent responsibilities, authority limits, inputs/outputs, escalation rules.
4. [`04-development-pipeline.md`](04-development-pipeline.md) — how a task becomes committed code today, and the proposed automated version.
5. [`05-qa-pipeline.md`](05-qa-pipeline.md) — the review-tier and browser-verification system, generalized.
6. [`06-release-process.md`](06-release-process.md) — what "release" means today (there is no deployment yet) and the proposed staged version.
7. [`07-incident-response.md`](07-incident-response.md) — proposed; no incident has occurred yet to generalize from.
8. [`08-repository-standards.md`](08-repository-standards.md) — conventions already enforced vs. proposed additions.
9. [`09-deployment-architecture.md`](09-deployment-architecture.md) — proposed target architecture (Coolify-centered), since none exists today.
10. [`10-infrastructure-roadmap.md`](10-infrastructure-roadmap.md) — phased rollout, VPS sizing, cost ranges, tool necessity analysis, installation sequence, and the credentials/decisions that need the founder.
11. [`11-vos-placeholder.md`](11-vos-placeholder.md) — explicitly out of scope pending repository access.

## What this project is, in one paragraph

Pocket Studio's own `execution/` directory (Decision Ledger, Evidence Ledger, phase-exit reviews, a founder-facing final-audit report) and its three governance documents already constitute a working, evidenced AI engineering discipline — not a hypothetical one. This session used it directly: a fresh-context subagent independently reviewed the Stage 3 slice and returned a structured verdict (`execution/reviews/level3/stage-3/ROUND_1_REVIEW.md`), and a live browser-automation agent executed the Official V1 Acceptance Test end to end (`execution/final-audit/OFFICIAL_V1_ACCEPTANCE_TEST_EXECUTION_REPORT.md`). The work below generalizes that proven pattern into something reusable across Lucrio and, once its repository is available, VOS — rather than inventing a new one from scratch.
