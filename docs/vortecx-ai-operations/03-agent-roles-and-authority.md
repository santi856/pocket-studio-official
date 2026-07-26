# Agent Roles and Authority Boundaries

## Claude Code — Chief Engineer / Orchestrator

**Status: proven, in continuous use.**

- **Responsibilities**: inspect repositories, implement features and fixes, run builds/tests/lint/typecheck, manage git history, spawn and brief independent reviewers, drive browser verification, maintain the Decision/Evidence Ledger.
- **Authority**: may install dev dependencies, run migrations against dev/test databases, create commits, push to `main` when explicitly asked. May not: spend money, purchase subscriptions, expose secrets, use production credentials without approval, delete user data, force-push, modify billing information, change domains, or deploy to production without explicit approval (this session's own operating rules; unchanged here).
- **Inputs**: founder objective, repository state, governance documents.
- **Outputs**: commits, ledger entries, reports, escalating questions when genuinely blocked.
- **Success metric**: work is verified (tests pass, browser-confirmed where applicable) before being reported complete — not "should work."
- **Escalation**: per `02-engineering-handbook.md` §3.

## Independent Reviewer (fresh-context Claude subagent)

**Status: proven this session** (`execution/reviews/level3/stage-3/ROUND_1_REVIEW.md`).

- **Responsibilities**: adversarial review of a completed unit of work — assume it was built by another team and try to disprove its quality (Review Protocol §1). Re-verify claims directly (re-run tests, read source, trace call chains) rather than trust the ledger's own account of them.
- **Authority**: read-only. Explicitly instructed not to modify code — a review produces a findings record, not a fix.
- **Inputs**: the three governance documents, repository state, the specific decision/evidence records under review, known limitations. Never the implementer's own conversation history or hidden reasoning (Review Protocol §2 — this is what makes it independent).
- **Outputs**: a structured record (what's good / bad / must-fix-now / can-wait / should-be-removed / final judgment) plus an explicit independence-status statement and a §7 audit sample of prior findings.
- **Success metric**: findings are evidence-based and reproducible, not vague criticism.
- **Escalation**: a CRITICAL DEFECT (Review Protocol §4) blocks further work on the affected capability until repaired.

## QA / Browser Verification (Claude in Chrome)

**Status: proven this session** (`execution/final-audit/OFFICIAL_V1_ACCEPTANCE_TEST_EXECUTION_REPORT.md`).

- **Responsibilities**: drive the actual running application as a real user would — clicks, form input, navigation, sign-in/out, console and network inspection. Never mark a task complete from code inspection alone (this session's own standing rule).
- **Authority**: interacts with dev/staging instances only. Never told to interact with production without a separate, explicit instruction.
- **Inputs**: a specific journey to verify (e.g., the Official V1 Acceptance Test's step list).
- **Outputs**: pass/fail per step, screenshots/evidence, console/network findings, a severity-and-reproduction-steps record for any failure.
- **Success metric**: every claimed-working flow has a corresponding live verification, not an assumption.
- **Real limitation found this session, disclosed rather than hidden**: viewport-resize tooling did not reliably change the actual rendered width in this environment — reported as a tooling gap, not fabricated as a pass.

## Deployment Agent (Coolify) — PROPOSED FUTURE STANDARD

Not installed anywhere; no host provisioned. See `10-infrastructure-roadmap.md` for sizing, cost, and sequencing.

- **Proposed responsibilities**: build and deploy to a staging environment automatically on merge to a designated branch; production deploys require an explicit, separate founder-approved action — never automatic.
- **Proposed authority**: may deploy to staging autonomously. May never deploy to production, modify DNS, or rotate production credentials without the founder's explicit, per-deployment approval (matching the founder's own stated rule verbatim).
- **Proposed inputs**: a green build from the Development/QA pipeline.
- **Proposed outputs**: a deployed environment, a rollback point, and a deployment evidence record (mirroring the Decision/Evidence Ledger pattern already proven above — the same discipline, applied to infrastructure instead of code).

## Secondary Implementer (OpenHands, or an additional Claude Code subagent) — PROPOSED, LOWEST PRIORITY OF THE FIVE NEW TOOLS

Not installed. Its purpose would be parallel implementation capacity beyond a single Claude Code session. **Real overlap to weigh before adopting**: Claude Code's own Agent tool already spawns isolated, fresh-context subagents (proven above, twice, this session) and can run them in an isolated git worktree. A second, separately-hosted implementer agent is justified only if the goal is specifically multi-model diversity (a non-Claude model's independent perspective) or a persistently-running agent decoupled from any interactive Claude Code session's lifetime — not simply "more implementation capacity," which the existing subagent system already provides. See `10-infrastructure-roadmap.md` §4 for the full necessity analysis.

## Orchestration Layer (Langflow) — PROPOSED, DEFERRABLE

Not installed. Would visually wire together which agent handles which step. **Real overlap**: the pipeline described in `04-development-pipeline.md` today is orchestrated by Claude Code directly (deciding what to run, in what order, and reading the result) — a visual workflow tool adds value mainly if multiple non-technical people need to edit the pipeline without writing code. For a founder-plus-Claude-Code operating model, this is currently better served by scripts or a CI configuration file, both of which are version-controlled the same way the rest of the codebase already is (Langflow flows typically are not).

## Shared Chat Interface (Open WebUI) — PROPOSED, LOWEST PRIORITY

Not installed. Its main value is a unified chat UI across multiple LLM providers/local models. Since this organization is standardizing on Claude (Claude Code as the primary surface), Open WebUI's marginal value today is small — mainly relevant if and when a team beyond the founder needs shared, non-CLI access to ask questions of the system.

## Recurring Browser Automation (Maxun) — PROPOSED, DEFERRABLE

Not installed. **Real overlap**: Claude-in-Chrome (proven, this session) and Playwright (already a Pocket Studio dependency, `@playwright/test` in `devDependencies`, 14 existing e2e test files) both already provide browser automation. Maxun's distinct angle — a no-code UI for scheduling recurring scrapes/checks without an LLM in the loop each time — is a real but narrow capability; not worth a new service until a concrete recurring-automation need is identified that Playwright's existing e2e suite doesn't already cover.
