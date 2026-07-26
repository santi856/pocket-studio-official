# Infrastructure Roadmap

Status: nothing described here is installed. No VPS is provisioned (founder-confirmed). This document is the plan to execute once one exists — it does not install, purchase, or provision anything itself.

## 1. Minimum VPS requirements

Sized for: Coolify itself + one project's staging environment + occasional single-agent use of whichever of OpenHands/Langflow/Open WebUI are eventually adopted, run sequentially rather than concurrently.

| Resource | Minimum |
|---|---|
| vCPU | 4 (dedicated, not burstable/shared-core) |
| RAM | 8 GB |
| Storage | 100 GB SSD (NVMe preferred) |
| Bandwidth | 1–2 TB/month (typical provider allowance at this tier; unlikely to be a real constraint at this scale) |
| OS | Ubuntu 22.04/24.04 LTS (Coolify's officially supported/tested target) |

**Why this floor, not lower**: Coolify's own Docker + Traefik + database overhead alone reasonably consumes 1–2 GB idle; a single Next.js production build/container for one project needs headroom beyond that; and this session directly demonstrated that under-provisioned memory (this dev machine dropped to ~88 MB free RAM) causes real, measured slowdowns in build/lint/test tooling — the same class of tool would run on this VPS. 8 GB is the practical floor to avoid repeating that on a shared host running multiple services.

## 2. Recommended VPS requirements

Sized for: Coolify managing staging *and* production for Pocket Studio and Lucrio simultaneously, plus concurrent use of at least one of OpenHands/Langflow if adopted, plus reasonable safety margin.

| Resource | Recommended |
|---|---|
| vCPU | 8 (dedicated) |
| RAM | 16–32 GB |
| Storage | 200+ GB NVMe SSD |
| Bandwidth | 2–5 TB/month |
| Backups | automated daily snapshots, provider-native or Coolify-scheduled |

## 3. Estimated monthly cost range

Approximate, current-market, **verify against the specific provider and region at purchase time** — infrastructure pricing changes and this is not a quote:

| Tier | Provider class | Approx. monthly cost |
|---|---|---|
| Minimum (4 vCPU / 8 GB) | Value/dedicated-vCPU providers (e.g. Hetzner Cloud CCX-class, OVH) | **$20–40/mo** |
| Minimum (4 vCPU / 8 GB) | Mainstream providers (DigitalOcean, Vultr, Linode) | **$40–60/mo** |
| Recommended (8 vCPU / 16–32 GB) | Value/dedicated-vCPU providers | **$50–90/mo** |
| Recommended (8 vCPU / 16–32 GB) | Mainstream providers | **$150–240/mo** |

Hetzner is what Coolify's own documentation most commonly points to for cost-effective self-hosting, if minimizing cost is the priority over a specific provider's support/SLA. Add ~$5–15/mo for automated backups/snapshots regardless of provider, and a few dollars/month for a domain if one isn't already owned.

## 4. Which tools are actually necessary

Full reasoning already given in `03-agent-roles-and-authority.md`; summarized here as a direct answer:

| Tool | Necessary now? | Why |
|---|---|---|
| **Coolify** | **Yes** | Closes a verified, already-disclosed gap (no deployment provider, no CI/CD, no staging/production distinction exists anywhere today). Nothing else in the current toolset provides this. |
| OpenHands | No — defer | Overlaps with Claude Code's own Agent/subagent system, already proven twice this session (independent review, and could equally spawn a second implementer). Adds value only for multi-model diversity or a persistently-running headless agent decoupled from an interactive session — neither is a stated need yet. |
| Langflow | No — defer | Overlaps with plain orchestration scripts / CI configuration, which are simpler, version-controlled the same way the rest of the codebase is, and require no separate service to maintain. Adds value mainly for non-technical visual pipeline editing, not currently a stated need. |
| Open WebUI | No — defer | Overlaps with Claude Code's own CLI/chat interface. Adds value mainly as a shared, non-CLI chat surface for a team beyond the founder — not a current need. |
| Maxun | No — defer | Overlaps with Claude-in-Chrome (proven this session) and Playwright (already a Pocket Studio dependency, 14 existing e2e tests). Adds value for scheduled, LLM-free recurring scrapes/checks — no concrete need identified yet that the existing tools don't cover. |

## 5. Which tools overlap and should be deferred

Restated directly: **OpenHands, Langflow, Open WebUI, and Maxun should all be deferred.** Not because they're bad tools, but because each duplicates a capability already proven working in this exact engineering process (Claude Code's subagent system, plain scripts/CI, Claude Code's own chat interface, and Claude-in-Chrome/Playwright, respectively) — installing all five at once on a fresh host would be adopting complexity ahead of a validated need, the same "overbuilding" pattern Pocket Studio's own Review Protocol §4 explicitly names as a finding category to avoid.

**Recommended actual sequence: Coolify only, first.** Re-evaluate the other four after Coolify has been running Pocket Studio's staging/production for a real period of time and a concrete, specific gap emerges that one of them would close.

## 6. Secure installation sequence

Once a VPS is provisioned (founder action — payment/account required, not something this process can do):

1. **Harden the base OS before installing anything**: SSH key-only authentication, disable root login and password auth, configure `ufw` (allow only 22/80/443 plus Coolify's own required ports), enable unattended security upgrades, install `fail2ban`.
2. **Create a non-root sudo user** for all subsequent operations — never operate as root day-to-day.
3. **Install Docker + Docker Compose** via the distribution's official method (not a third-party script).
4. **Install Coolify** via its official installer, run over SSH as the sudo user.
5. **Point a domain/subdomain's DNS at the VPS** (founder-owned domain access required) and let Coolify's built-in Traefik + Let's Encrypt automation issue TLS — never disable TLS for convenience.
6. **Configure Coolify's own secrets vault**; connect GitHub via a repository-scoped deploy key or a GitHub App install limited to the specific repositories (Pocket Studio, Lucrio, later VOS) — never a personal access token with full account scope.
7. **Deploy Pocket Studio to staging first.** Never the first deployment target being production, regardless of how confident the build looks locally.
8. **Exercise a rollback on staging at least once** before any production environment is configured, so rollback is a tested action, not a hoped-for one.
9. **Only then configure a production environment**, with the founder-approval gate from `06-release-process.md` wired in before the first real production deploy.
10. **Defer steps for OpenHands/Langflow/Open WebUI/Maxun** until §5's re-evaluation trigger is met; if and when adopted, each gets its own isolated Coolify-managed service with its own least-privilege credentials — never sharing an API key across tools.

## 7. Credentials and founder decisions this roadmap requires

None of the following can be supplied or decided by an autonomous agent — each is either a payment, a credential, or a direction decision per this session's own founder-interrupt rule:

- **VPS provider account and payment** — the founder provisions and pays; no agent purchases anything.
- **Domain/subdomain DNS access** — needed for Coolify's TLS automation.
- **A scoped GitHub deploy key or GitHub App install** for the repositories to be deployed — least privilege, not a personal token.
- **A decision on whether to reuse Pocket Studio's existing dev database patterns or provision a managed Postgres instance for staging/production** — an architecture choice with real cost and durability implications.
- **If and when OpenHands/Langflow are later adopted**: a separate Anthropic (or other provider) API key for that service specifically, with its own spend limit and alerting — never sharing the key already used for Claude Code itself, so a runaway automated process cannot silently consume the same budget or credentials.
- **Confirmation of the production-approval gate mechanism** — e.g., a specific person/Slack channel/manual Coolify click — before the first production deployment is configured, not decided unilaterally here.
