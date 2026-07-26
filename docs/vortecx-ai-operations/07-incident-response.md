# Incident Response — PROPOSED FUTURE STANDARD

No incident has occurred in Pocket Studio to generalize a process from — there is no production deployment yet for an incident to happen to (see `06-release-process.md`). Everything below is a proposal, not a description of existing practice, and is written to be adoptable the day a real deployment exists rather than invented after the first real incident.

## Severity classification (adapted from Review Protocol §4's finding classification, which is already proven)

Pocket Studio's Review Protocol already defines a severity taxonomy for *findings during review* (DEFECT, CRITICAL DEFECT, ARCHITECTURAL RISK, CUSTOMER-RISK, BUSINESS-RISK). The same taxonomy, read as *live* rather than *reviewed*, is the natural incident-severity scale:

- **CRITICAL** — matches Review Protocol's own definition: security/tenant-isolation breach, data loss/corruption, destructive behavior, billing authority failure, legal/privacy misrepresentation, a broken primary workflow, or unrecoverable failure. Immediate response, founder notified immediately regardless of hour.
- **HIGH (CUSTOMER-RISK / BUSINESS-RISK)** — causes real confusion, loss, unexpected cost, or misuse, but is not an active data/security breach. Response within the same working session.
- **MEDIUM (DEFECT)** — a real behavior failure against a defined requirement, not customer-facing at scale. Normal repair discipline (record → root-cause → smallest fix → regression test), no emergency posture.

## Proposed response sequence

1. **Detect.** Once Coolify exists, its health checks are the first line; until then, detection is manual (founder or Claude Code noticing a failure).
2. **Contain**, using the least destructive reversible action first — this session's own operating discipline (prefer stash over delete, prefer rollback over rewrite) applies directly to an incident, not just to code edits.
3. **Root-cause before fixing** — Review Protocol §9's repair discipline applies unchanged: record → root-cause → smallest correct fix → regression test → revalidate. Never patch symptoms under pressure in a way that would fail Review Protocol §6 (never weaken a test to get a passing result, including under incident pressure).
4. **Record it exactly like a Decision Ledger entry** — what failed, why, the fix, the evidence it's fixed, whether it can recur. This is not a new mechanism; it is the same Decision/Evidence Ledger pattern already proven for ordinary engineering decisions, applied to an incident.
5. **Rollback authority**: Claude Code may roll back a *staging* deployment autonomously. Rolling back *production* is bounded by the same rule as deploying to it — founder approval, unless the incident is actively CRITICAL and ongoing, in which case contain-first/report-immediately-after is the correct order (an active data-loss event should not wait for an approval round-trip to stop).
6. **Post-incident**: update `knownLimitations`/equivalent and, if a prior review should have caught this, note it explicitly — Review Protocol §8's "prior-finding regression" discipline already requires checking whether a new defect repeats a previously-identified class; the same check applies to a live incident retroactively.

## What must always interrupt the founder, incident or not

Unchanged from `02-engineering-handbook.md` §3: credentials, paid services, legal/compliance decisions, product direction, production actions, and irreversible/highly destructive actions. An incident does not lower this bar — if anything, an incident is exactly when an under-authorized autonomous action is most likely to make things worse.
