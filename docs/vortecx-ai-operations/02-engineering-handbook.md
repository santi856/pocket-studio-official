# Vortecx Labs Engineering Handbook

This handbook generalizes principles already proven in Pocket Studio's own three governance documents (`docs/POCKET_STUDIO_OFFICIAL_MASTER_SPEC_v1.0.md`, `..._EXECUTION_PROTOCOL_v1.0.md`, `..._REVIEW_PROTOCOL_v1.0.md`). It does not replace them for Pocket Studio — they remain that project's own authority. It exists so Lucrio, and later VOS, can adopt the same discipline without starting from nothing.

## 1. The core discipline, proven on Pocket Studio

1. **Work is never assumed good merely because code exists, tests pass, or the interface looks polished** (Review Protocol §0). Every capability is checked against real customer behavior before being called complete.
2. **Never invent a requirement.** When information is genuinely missing, it is disclosed as a known limitation or escalated to the founder — not guessed. Pocket Studio's `knownLimitations` array in `execution/state.json` (36 entries as of this session) is the proof this is actually practiced, not aspirational.
3. **A Decision Ledger and an Evidence Ledger, append-only, for every consequential choice.** `execution/decisions/ledger.jsonl` (90 entries) and `execution/evidence/ledger.jsonl` (136 entries) are not documentation written after the fact for appearances — they were written and read *during* this very session to decide what to do next (e.g., discovering the Master Spec defines no "Phase 4" corrected a stale ledger entry rather than being silently carried forward).
4. **Independent review is mechanical, not aspirational** (Review Protocol §2). "Independent" means a fresh context with no access to the implementer's own reasoning — proven this session via a spawned subagent reviewing the Stage 3 slice.
5. **Repair discipline**: record → root-cause → smallest correct fix → regression test → revalidate. Never regenerate a whole system when a targeted repair is possible; repairs are capped at three attempts before reassessing the approach (Execution Protocol §9 / Review Protocol §9).
6. **Test integrity is protected explicitly.** Weakening, skipping, or deleting a test to obtain a passing result is a named violation (Review Protocol §6), not just bad practice — every material test change records why.

## 2. What "Definition of Done" means here

Adapted from Master Spec §70. A capability is complete only when:

- the implementation exists;
- the supported behavior actually works, not just compiles;
- relevant security/privacy implications are addressed;
- appropriate automated tests pass, and were run — not merely "should pass";
- evidence of the above exists in a durable, reviewable form;
- failure and recovery behavior are defined, not just the happy path;
- documentation and execution state are updated in the same unit of work;
- stable work is committed.

Do not call anything "production-ready," "secure," "compliant," or "complete" without evidence proportional to that specific claim.

## 3. Founder-interrupt discipline

Adapted from this session's own operating rules. An agent stops and asks only when:

- a credential, paid service, or subscription is required;
- a legal or compliance decision is required;
- a product-direction decision is required;
- production deployment approval is required;
- an irreversible or highly destructive action is under consideration;
- a genuine architectural decision would contradict an existing, deliberately-designed invariant elsewhere in the codebase (this session's real example: implementing "real data deletion" naively would have violated Master Spec §62's protection against deleting customer data over nonpayment, and broken an existing, deliberate, passing test — that was escalated rather than silently resolved either way).

Everything else is handled autonomously, with the smallest reliable, most reversible action taken first.

## 4. What is proven vs. proposed in this handbook

Everything in §1–3 above is proven — practiced on Pocket Studio, with citations to real files and counts as of this session. Anything below this line in other documents in this directory that is not similarly evidenced is marked "PROPOSED FUTURE STANDARD" and should be read as a recommendation, not a claim of existing practice.
