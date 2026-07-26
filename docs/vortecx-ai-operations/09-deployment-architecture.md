# Deployment Architecture — PROPOSED FUTURE STANDARD

Nothing in this document exists today. Pocket Studio has never been deployed anywhere beyond a local dev server (verified: no DeploymentProvider implementation exists — `execution/state.json`'s `requiredCustomerActions`). This is the target architecture to build toward once a host is provisioned (`10-infrastructure-roadmap.md`), not a description of anything running.

## Target shape

```
                         ┌─────────────────────────────┐
                         │   Dedicated VPS (new host)   │
                         │                              │
   GitHub (existing) ───▶│  Coolify                    │
   git push to main      │   ├─ builds from Dockerfile  │
                         │   │   or Nixpacks detection  │
                         │   ├─ staging environment     │
                         │   │   (Pocket Studio, then    │
                         │   │    Lucrio once ready)     │
                         │   ├─ production environment   │
                         │   │   (deploy gated on        │
                         │   │    founder approval)      │
                         │   ├─ TLS via Traefik +        │
                         │   │   Let's Encrypt           │
                         │   └─ managed Postgres         │
                         │       (or point at existing   │
                         │       managed DB per project)  │
                         └─────────────────────────────┘
```

## Why Coolify specifically, and why it's the one tool of the five actually necessary

Of the five new tools named in scope (Coolify, OpenHands, Langflow, Open WebUI, Maxun), Coolify is the only one that closes a **verified, already-disclosed gap** rather than duplicating a capability Claude Code, Claude-in-Chrome, or Playwright already provides (full reasoning in `03-agent-roles-and-authority.md` and `10-infrastructure-roadmap.md` §4). Pocket Studio's own Master Spec never names a deployment vendor (by design — Decision Ledger `D-0001` deliberately kept the stack provider-agnostic where the spec didn't require a specific choice), so choosing Coolify here is this document's proposal, not something the Master Spec already decided — flagged as such rather than presented as already-settled.

## Data and environment boundaries

- **Staging** uses its own database, seeded independently — never a copy of production customer data, matching the same tenant-isolation discipline already enforced in application code (`08-repository-standards.md`).
- **Production credentials never touch a staging environment or a Claude Code session directly** — Coolify's own secrets vault holds them; Claude Code triggers deploys through Coolify's API/CLI with a scoped deploy token, never by handling the underlying database or provider credentials itself.
- **Each project (Pocket Studio, Lucrio, later VOS) gets its own isolated environment(s)** on the shared host — no cross-project database or credential sharing, the same tenant-isolation principle applied one level up, from customer-organizations-within-a-product to products-within-the-company.

## What is explicitly out of scope for this architecture document

Mobile app store submission (no StoreReviewProvider exists; a separate, disclosed gap), real third-party billing/OAuth integrations (separately disclosed in `execution/state.json`), and anything involving VOS (`11-vos-placeholder.md`).
