# AI Engineering Organization Chart

## Today (proven, in active use on Pocket Studio)

```
Founder (Jesse)
  │
  │  objectives, product/legal/credential decisions, production approval
  ▼
Claude Code — Chief Engineer / Orchestrator
  │
  ├─▶ Implements directly (this session: generated-app auth/session, account
  │    deletion flow, litter cleanup, tenant-isolation exceptions)
  │
  ├─▶ Spawns a fresh-context Claude subagent as an INDEPENDENT reviewer
  │    (Review Protocol §2's "Level 3" mechanism) — receives only governance
  │    docs + repo state + evidence, never the implementer's own reasoning.
  │    Proven this session: Stage 3 Level 3 review, verdict ACCEPT.
  │
  └─▶ Drives Claude in Chrome as an independent QA engineer — real browser,
       real clicks, real console/network inspection, not a mocked test.
       Proven this session: full Official V1 Acceptance Test execution.
```

Everything above is real and evidenced in `execution/decisions/ledger.jsonl`, `execution/evidence/ledger.jsonl`, and the two reports referenced in the README. There is no OpenHands, Langflow, Coolify, or Open WebUI in this chart — none are installed anywhere on the machine this work was done on (verified: `which openhands|langflow|coolify|open-webui|maxun` all return not-found; no matching Docker images).

## Proposed (once a dedicated host exists — see `10-infrastructure-roadmap.md`)

```
Founder
  │  objective, credentials, paid-service approval, production approval,
  │  legal/compliance decisions, product direction
  ▼
Claude Code — Chief Engineer / Orchestrator            (PROVEN role, same as today)
  │
  ├─▶ Independent Reviewer            (PROVEN — fresh-context Claude subagent,
  │                                     Review Protocol §2, unchanged)
  │
  ├─▶ QA / Browser Verification       (PROVEN — Claude in Chrome, unchanged)
  │
  ├─▶ Deployment                      (PROPOSED — Coolify: staging → production
  │                                     with an explicit founder-approval gate
  │                                     before any production deploy, per the
  │                                     founder's own stated rule)
  │
  └─▶ Secondary Implementer           (PROPOSED, DEFERRABLE — OpenHands, or an
                                        additional Claude Code subagent; see
                                        `03-agent-roles-and-authority.md` for
                                        why this overlaps with capability
                                        Claude Code's own Agent/subagent
                                        system already provides)
```

Langflow, Open WebUI, and Maxun are deliberately **not** placed in this chart as distinct roles — `10-infrastructure-roadmap.md` explains why each overlaps with a capability already proven above (subagent orchestration, Claude Code's own CLI/chat surface, and Claude-in-Chrome/Playwright respectively) and should be deferred rather than adopted by default.

## Cross-project application

This chart is Pocket Studio-specific only in its evidence (the ledger entries and reports cited above belong to Pocket Studio). The roles themselves are project-agnostic: Lucrio can adopt the same Chief Engineer / Independent Reviewer / QA structure without needing its own governance documents rewritten from scratch, once its Master Spec / Execution Protocol / Review Protocol equivalents exist (see `02-engineering-handbook.md`). VOS is out of scope until its repository is available (`11-vos-placeholder.md`).
