# POCKET STUDIO OFFICIAL — REVIEW PROTOCOL v1.0

This protocol governs how implementation work is critically reviewed: tiered self-review, adversarial phase-exit review with enforced independence, finding classification, test integrity, and review integrity.

It consolidates and supersedes the prior Continuous Self-Review Protocol and the review-related sections of the Correction Protocol. No other review document is authoritative.

Work is never assumed good merely because code exists, tests pass, the interface looks polished, the build succeeds, a requirement was technically satisfied, or a checklist is complete. The purpose of review is not endless criticism; it is to find material weaknesses early, improve the product, and prevent false completion. Self-review improves implementation — it never replaces implementation, and critique alone is never a deliverable.

---

## 1. REVIEW TIERS

### LEVEL 1 — IMPLEMENTATION-UNIT REVIEW

Run after each coherent implementation unit. Concise and evidence-based. Answer:

* Did the required behavior work?
* What is strong?
* What is weak, incomplete, or fragile?
* Did relevant validation and tests pass?
* Is Truth Status accurate?
* Is any immediate repair required?

### LEVEL 2 — MILESTONE REVIEW

Run after major connected capabilities or complete customer workflows. Apply the relevant perspectives from §3 and identify: strengths; defects; architectural risks; customer risks; business risks; overbuilding; underbuilding; safe deferrals. Inspect material test changes (§6) and check prior-finding regression (§8).

### LEVEL 3 — PHASE-EXIT ADVERSARIAL REVIEW

Run before any phase exit gate can pass. Review the complete phase against: the Master Spec; phase requirements and exit criteria; customer journeys; implementation, test, build, migration, and runtime evidence; security boundaries; tenant isolation; Product State integrity; Simple Mode / Expert Mode synchronization; Truth Status; and known limitations.

The reviewer assumes the work was produced by another team and attempts to disprove its quality. Ask: How could this fail in production? How could a customer misunderstand it? How could it lose or leak data? How could it create unexpected cost, a false claim, or legal/marketplace risk? How could it break another workflow or be abused? How could it appear complete while remaining nonfunctional? What would a skeptical senior engineer, designer, or paying customer reject? What evidence is missing?

A phase never passes because its checklist is marked complete. It passes only when implementation, tests, evidence, and customer behavior support the claim.

---

## 2. INDEPENDENCE GATE (LEVEL 3)

On Claude Code, an independent review context is **presumed available**: spawn a fresh-context subagent as the phase-exit reviewer.

The reviewer receives only:

* the three governance documents;
* repository state;
* relevant implementation artifacts;
* test, build, migration, and runtime evidence from the Evidence Ledger;
* known limitations.

The reviewer never receives implementation self-justification, build-conversation history, or hidden reasoning as review evidence.

Fallback to non-independent review is permitted **only after a recorded technical failure to spawn the reviewer**, and the failure record is itself an evidence record. A non-independent review must: be the strongest available evidence-based adversarial review; be explicitly recorded as non-independent in the Evidence Ledger; never be described as independent verification; be flagged in the phase-completion report and the next milestone heartbeat so the customer sees it; and preserve the phase checkpoint.

Every Level 3 review records its independence status in the Evidence Ledger. Independent human review is not required between routine phases unless a material risk, external authority, or consequential decision requires it.

---

## 3. REVIEW PERSPECTIVES

Apply the perspectives relevant to the work under review. Use proportional judgment — Level 1 rarely needs more than two; Level 3 typically needs most.

**Customer & simplicity.** Is the experience understandable and actually simple? Does it solve the customer's problem? Does the customer know what to do next, see important limitations, understand decisions, and recover from mistakes? Can a nontechnical user succeed? Can this require fewer customer actions — can Pocket Studio infer it safely? Are technical details kept in Expert Mode without hiding consequential decisions? Is the customer being forced to coordinate internal systems or learn implementation terminology? Periodically walk the full new-customer journey (understand the product → create account → create project → describe idea → understand recommendations → decide → generate → edit → recover → connect services → understand costs, ownership, launch status → export → switch modes → find help) and record confusion, unnecessary steps, misleading status, jargon, hidden blockers, and dead ends.

**Product.** Does this support the product promise and preserve Product DNA? Does it create differentiated, meaningful value? Is the workflow complete? Is anything missing from the customer or business-owner journey? Is the feature solving the right problem?

**Design & UX.** Clear hierarchy; intuitive, consistent interaction; Simple Mode actually simple; Expert Mode powerful without chaos; complete loading/empty/error/recovery states; accessible; professionally designed; visual polish not masking weak functionality.

**Engineering.** Coherent architecture; maintainable implementation; clear boundaries; no duplicated logic or excessive coupling; authoritative state; handled errors; meaningful tests; recoverable system; no unnecessary complexity; no critical capability that is only mocked.

**AI & orchestration.** Correct Product State loaded; structured outputs; no contradicting agents or modules; complete impact analysis; no unsupported assumptions or unnecessary questions; no hidden consequential decisions; AI not doing work deterministic systems should perform; unrelated decisions preserved; genuine product understanding demonstrated.

**Security.** Correct authorization boundaries; tenant isolation preserved; secrets protected; least-privileged actions; validated inputs and outputs; prompt injection cannot alter protected systems; no cross-customer data access; generated applications cannot expose sensitive information; consequential actions properly approved.

**Privacy & governance.** No unnecessary data collection; sensitive data identified; retention and deletion represented; external transfers visible; no overstated legal or policy claims; source dates and uncertainty represented; professional-review requirements surfaced; translated legal documents synchronized; no compliance claims without authority.

**Business.** Helps the customer earn, save, reduce risk, or operate better; sensible monetization; visible costs; realistic operational burden; support liability, pricing, and cost-to-serve aligned; Pocket Studio not absorbing customer costs incorrectly; no promises the plan cannot sustain.

**Quality.** The feature actually works; happy path, failure paths, and edge cases tested; sufficient evidence; Truth Status matches reality; tests prove behavior rather than implementation details; no test passing only because the scenario was too weak.

**Competitive.** Meaningfully better than alternatives, or honestly table stakes; contributes to Product Truth, consequence-aware editing, Product DNA, or outcome learning; a more defensible implementation considered. Implement table stakes well but never describe them as a moat.

---

## 4. FINDING CLASSIFICATION

**STRENGTH** — verified implementation or design choice to preserve; record why.

**IMPROVEMENT** — useful enhancement that does not block; record and prioritize.

**DEFECT** — behavior failing a defined requirement; fix before marking the capability complete.

**CRITICAL DEFECT** — involves security, tenant isolation, secrets, data loss, corruption, destructive behavior, billing authority, legal or privacy misrepresentation, unsupported production claims, a broken primary workflow, or unrecoverable failure. Never proceed past a critical defect that invalidates the next work.

**ARCHITECTURAL RISK** — may create expensive rework or inconsistency; decide fix-now vs. record-with-defined-trigger.

**CUSTOMER-RISK FINDING** — likely to cause confusion, loss, unexpected cost, misuse, or failure; fix or surface clearly.

**BUSINESS-RISK FINDING** — affects cost to serve, margins, support burden, liability, churn, pricing, scalability, or customer ownership.

**OVERBUILDING** — complexity or cost exceeding validated need; simplify unless the foundation is expensive to retrofit and justified.

**UNDERBUILDING** — appears complete but omits essential behavior; never hidden behind future-roadmap language.

**DEFERRED** — valid but not required for the active phase; record reason, dependency, target phase, and revisit trigger.

Every material criticism includes: evidence; impact; severity; recommended action; blocking status. Adversarial critique is never empty pessimism.

---

## 5. REVIEW OUTPUT AND JUDGMENT

Each Level 2 and Level 3 review produces a structured record:

* **What is good** — strong decisions, working behavior, customer value, preserved architecture, evidence.
* **What is bad or weak** — defects, confusion, missing behavior, risk, technical debt, weak assumptions.
* **What must be done now** — blocking fixes, required tests, redesign, evidence, customer clarification.
* **What can wait** — safe improvements, later-phase work, reason for deferral.
* **What should be removed or simplified** — unnecessary abstraction, duplicate systems, speculative features, confusing UX, unsupported claims.
* **Final judgment** — reject / revise / conditionally accept / accept / accept with deferred improvements.

Never accept work with unresolved critical defects. Phase acceptance must cite specific evidence IDs.

---

## 6. TEST-INTEGRITY PROTECTION

Tests are part of the product contract. Whenever an existing test is modified, weakened, skipped, disabled, deleted, or replaced, record: the affected test; the reason; the related requirement change; whether expected behavior changed; whether coverage is reduced; replacement coverage; review status.

Never weaken a test merely to obtain a passing result, delete a failing test to hide a defect, or replace behavioral assertions with shallow implementation assertions. When a requirement legitimately changes, update the test and preserve the reason in the Decision Ledger or Change Set.

Material test changes are inspected at every Level 2 and Level 3 review.

---

## 7. REVIEW-INTEGRITY PROTECTION

A review record is not proof that a meaningful review occurred.

Every material defect identifies: affected requirement; evidence; severity; impact; recommended action; blocking status; resolution status. Where practical, a repaired defect links: evidence of the original failure → root cause → implementation change → regression test → passing verification after repair. Never fabricate artificial failures to satisfy this structure.

**Audit sample:** at every phase exit, re-verify three randomly selected previously resolved findings against current repository behavior — was the finding real, does the resolution remain effective, does the evidence remain valid, has the defect returned? Record the audit as evidence.

---

## 8. PRIOR-FINDING REGRESSION

Before accepting major related work: retrieve relevant unresolved and previously resolved findings; check whether the new implementation repeats the same defect class; verify prior protections remain effective; update evidence where behavior materially changed. Past critique must improve future implementation. Findings are never stored as inactive documentation, and critical review history is never discarded after fixes.

---

## 9. REPAIR AFTER REVIEW

When review identifies a fixable in-scope defect: record → root-cause → smallest correct fix → implement → add or update regression tests → revalidate → repeat the critique → update evidence and Truth Status → continue only when resolved or truthfully blocked.

Never regenerate entire systems when a targeted repair is possible. Repair attempts are capped at three per approach by the Execution Protocol (§9); after that, preserve the last stable version, record attempts, reassess the approach, and continue unrelated work.

---

## 10. LIMITS OF SELF-REVIEW

Self-review cannot independently prove: legal compliance; security certification; accessibility compliance; regulatory approval; professional correctness; market demand; customer satisfaction; product-market fit. It is also structurally limited — an implementer reviewing its own work in the same context shares that context's biases, which is why Level 3 independence (§2) is enforced mechanically rather than aspirationally.

Where external validation is required, recommend: customer testing; professional review; penetration testing; accessibility testing; legal review; regulatory review; platform review; real-user research; production monitoring. Never use self-critique as a substitute for independent review.

---

## 11. CONTINUATION AFTER REVIEW

After critique: fix blocking defects; record safe deferrals; remove unnecessary complexity; update evidence and Truth Status; commit stable work; continue to the next unblocked requirement.

Never stop merely to report criticism, and never ask the customer to approve routine repairs. Stop only when critique identifies: a consequential product decision; destructive impact; material cost; a legal or privacy authority requirement; a required credential; public publication; production impact; or a critical contradiction the Master Spec cannot resolve.

Critique must lead to repair, simplification, evidence-backed acceptance, justified deferral, or truthful blocking — nothing else.

— END OF DOCUMENT: POCKET STUDIO OFFICIAL REVIEW PROTOCOL v1.0 —
