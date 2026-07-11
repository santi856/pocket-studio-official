# POCKET STUDIO OFFICIAL — EXECUTION PROTOCOL v1.0

This protocol governs how the implementation system executes the Pocket Studio Official build: continuous three-phase delivery, autonomous progression, durable state, evidence, cost control, and recovery.

It consolidates and supersedes the prior Continuous Three-Phase Execution Protocol and the execution-related sections of the Correction Protocol. No other execution document is authoritative.

---

## 1. SOURCE-OF-TRUTH ORDER

Exactly three governance documents exist:

1. `docs/POCKET_STUDIO_OFFICIAL_MASTER_SPEC_v1.0.md` — product vision, three-phase plan, Dual-Mode Product Experience, phase requirements, exit criteria, Official V1 Acceptance Test.
2. `docs/POCKET_STUDIO_OFFICIAL_EXECUTION_PROTOCOL_v1.0.md` — this document.
3. `docs/POCKET_STUDIO_OFFICIAL_REVIEW_PROTOCOL_v1.0.md` — review tiers, adversarial review, finding classification, review integrity.

Authority order for any conflict:

1. Master Spec.
2. Execution Protocol.
3. Review Protocol.
4. Approved architecture decisions (Decision Ledger).
5. Approved customer decisions.
6. Current verified repository state.
7. Current execution state.
8. Evidence Ledger.
9. Truth Status.
10. Current implementation details.

On conflict: identify it, prefer the higher authority, preserve customer ownership, security, privacy, and truthful status, avoid destructive action, and record the resolution in the Decision Ledger.

Do not create a fourth governance document. Do not create a competing roadmap. Amendments are made by revising these documents and incrementing the version, never by adding patch layers.

---

## 2. COMPLETENESS CHECK (RUN BEFORE ANY IMPLEMENTATION SESSION BEGINS WORK)

1. Verify all three governance documents exist in `docs/`.
2. Mechanically verify each ends with its exact terminator line (grep, not judgment):
   - `— END OF DOCUMENT: POCKET STUDIO OFFICIAL MASTER SPEC v1.0 —`
   - `— END OF DOCUMENT: POCKET STUDIO OFFICIAL EXECUTION PROTOCOL v1.0 —`
   - `— END OF DOCUMENT: POCKET STUDIO OFFICIAL REVIEW PROTOCOL v1.0 —`
3. Verify the Master Spec contains: Phase 1, Phase 2, Phase 3, the Dual-Mode Product Experience, phase exit criteria, and the Official V1 Acceptance Test.
4. Record the check result as an evidence record.

If any check fails, this is a genuine blocker: report the specific missing or truncated material and stop implementation work on affected scope. Do not fill spec gaps with assumptions. Do not reopen settled product vision when the material is present and no material contradiction exists.

---

## 3. CONTINUOUS EXECUTION MANDATE

Pocket Studio is one continuous commercial build:

Phase 1 → Phase 1 Verification → Phase 2 → Phase 2 Verification → Phase 3 → Phase 3 Verification → Official V1 Acceptance Test → Controlled Commercial Launch Readiness.

Do not stop merely because: a task, feature, milestone, report, commit, or phase completed; an optional capability was deferred; a noncritical warning exists; an implementation approach changed; or a routine technical decision must be made.

After each verified implementation unit: record what changed → run required validation → fix in-scope failures → update evidence → update Truth Status → update execution state → commit stable work → select the next unblocked requirement → continue automatically.

Continuous execution means durable progress across sessions. It does not require one context window to execute the entire product, and it never licenses skipping validation, weakening tests, or self-certifying phase exits.

---

## 4. EXECUTION AUTHORITY

The implementation system is authorized, within the approved Master Spec, to: inspect the repository; design implementation details; select reasonable technical patterns; create, modify, and refactor files; create schemas, migrations, tests, and documentation; run tests; fix defects; install justified dependencies; remove unused artifacts when safe; commit; apply low-risk reversible defaults; and proceed through approved phases.

Routine decisions requiring no customer approval: file organization, naming, test organization, component composition, type definitions, schema validation details, internal service boundaries, routine accessibility/error-handling/responsive work, ordinary refactoring and dependency updates.

All decisions must remain consistent with: Canonical Product State, Product DNA, the Orchestration Contract, customer ownership, security/privacy/governance boundaries, the Truth System, phase scope, and official acceptance criteria.

---

## 5. EXECUTION STATE (DURABLE, REPOSITORY-BACKED)

Maintain structured execution state inside the repository (e.g. `execution/state.json` plus human-readable `execution/STATE.md`). Chat history is never the authoritative implementation record.

Track: current phase and status (not started / ready / active / partially complete / verification active / blocked / exit gate failed / exit gate passed / complete / superseded); current milestone; active implementation unit; completed, active, deferred, and blocked requirements; decisions; migrations; test and build status; evidence references; known limitations; required customer and external actions; and the exact next implementation action.

The project must remain fully recoverable if the session ends, context is compressed, another qualified agent continues, or a model or provider changes.

---

## 6. REQUIREMENT EXECUTION LOOP AND WORK BREAKDOWN

For every requirement: load repository state → load execution state → load relevant spec sections → identify dependencies → determine supported scope → design → implement → validate → test → repair → revalidate → create evidence → update Truth Status → update documentation → commit → select next unblocked requirement → continue.

Break each phase into implementation units that are: small enough to validate, large enough to produce meaningful progress, dependency-aware, independently testable where practical, recoverable, and traceable to Master Spec requirements and phase exit criteria.

Do not implement an entire phase as one uncontrolled generation. Do not create disconnected placeholder files or architecture without the supported phase behavior. Completion requires evidence appropriate to the capability — never merely the existence of files or generated code.

---

## 7. SESSION CONTINUITY AND CONTEXT-WINDOW PROTOCOL

At the start of every session: run the Completeness Check (§2) → inspect the repository → read execution state → read the Decision Ledger → review recent commits, active requirements, blockers, and test/build status → verify the current phase → determine the next unblocked implementation unit → continue from verified repository state. Do not restart the project, recreate completed systems without evidence replacement is required, or trust stale conversational claims over repository evidence.

When context capacity becomes materially constrained, treat it as a stable-checkpoint trigger, not a reason to push on:

1. Finish or safely stop the current atomic step.
2. Run relevant validation; preserve the last stable state; commit.
3. Update execution state: completed and active requirements, unresolved findings, blockers, test/build status, the exact next action, and required files/dependencies.
4. Write a concise recovery handoff.
5. End the session cleanly if continuation would reduce reliability.

Do not burn remaining context attempting to satisfy a literal reading of "do not stop."

---

## 8. BLOCKER CLASSIFICATION AND MINIMAL INTERRUPTION

**Internal implementation blocker** (type/test/build failure, invalid schema, broken migration, recoverable dependency issue): investigate and resolve autonomously. Never ask the customer to solve ordinary engineering problems.

**Customer information blocker** (legal name, pricing, jurisdiction, ownership or policy decision): ask the minimum necessary question; continue unrelated work.

**Credential or account blocker** (AI provider, Supabase, Stripe, Apple, Google Play, domain): do not request credentials before the integration is implemented and ready; provide exact setup instructions; never request secrets in conversation when a secure connection workflow exists; continue unrelated work.

**Consequential approval blocker** (production deployment, public release, store submission, legal publication, pricing change, destructive migration or deletion, material privacy or customer-rights change, external agreements): prepare all safe work first; request explicit authorization at the final consequential boundary.

**External blocker** (outage, marketplace review, account approval): record blocker, source, impact, status, workaround, required customer action, and next verification step; continue unrelated work.

Interrupt the customer only when: required information cannot be safely inferred; a consequential decision requires customer authority; a credential is required and no unrelated work remains; an action could create material cost, legal commitment, public publication, production impact, or destructive/irreversible effect; two product directions materially conflict; or the Master Spec provides insufficient authority.

When interrupting: state the blocker plainly, why it matters, what is complete, what continues without the answer; recommend a default where appropriate; ask the smallest possible question.

**Parallel unblocked work rule:** a blocked capability never stops the whole project. Missing Stripe credentials → continue billing domain logic, provider abstraction, webhook contracts, entitlements, mock-provider testing, restricted-mode behavior. Missing Apple account → continue mobile architecture, iOS project generation, build configuration, metadata, readiness validation. Missing AI credential → continue provider abstraction, structured contracts, mock provider, deterministic fallback, orchestration, persistence, testing.

---

## 9. VALIDATION, REPAIR, AND REPAIR-LOOP LIMIT

After each implementation unit run the relevant subset of: typecheck, lint, unit tests, schema tests, integration tests, authorization tests, tenant-isolation tests, accessibility checks, end-to-end tests, production build, mobile build validation, migration validation, security checks, and structured manual verification. Run the complete required validation set at milestone and phase boundaries.

On failure: investigate → identify root cause → design the smallest correct fix → implement → add or update regression coverage → rerun → record the result as evidence.

**Repair-loop limit:** no more than three targeted repair attempts per defect within one implementation approach. After three failures: preserve the last stable version; record the attempts; identify likely root causes; reevaluate the approach; consider a bounded alternative; continue unrelated unblocked work; escalate only when customer authority, material cost, external access, or an unresolved architectural contradiction is required. Do not replace stable architecture impulsively because one attempt failed.

Never bypass failing required checks repeatedly, weaken tests to obtain a pass, or remove required behavior to hide a defect. Test modifications are governed by the Review Protocol's Test-Integrity Protection and must be recorded there.

---

## 10. EVIDENCE CONTRACT (v1)

Truth Status, phase gates, and readiness reports are authoritative only when backed by Evidence Ledger records conforming to this contract. A statement written by the implementation system is not evidence merely because it appears in a report.

**Mandatory fields (every record):**

1. evidence ID;
2. evidence type;
3. artifact path or stable reference;
4. verification command or method;
5. result;
6. timestamp;
7. commit identifier.

**Conditional fields (only where relevant):** phase; milestone; implementation unit; requirement ID; capability ID; environment; produced by; independently reviewed (boolean) and reviewer identifier; limitations; expiration or re-verification trigger; related test/build/deployment/decision/Truth Status; organization and project ID once multi-tenancy exists.

**Evidence types:** source artifact; schema validation; typecheck; lint; unit test; integration test; end-to-end test; authorization test; tenant-isolation test; accessibility result; migration validation; production build; mobile build; runtime verification; screenshot; structured manual verification; deployment record; provider response; webhook verification; marketplace status; external approval; professional review; monitoring result; incident result.

Evidence must be invalidated, expired, or re-verified when the underlying implementation, environment, requirement, provider, policy, or external state materially changes. Do not mark a capability implemented, tested, deployed, operational, approved, compliant, secure, or production-ready without evidence appropriate to that claim. Self-assigned confidence ratings are not evidence and are not recorded.

---

## 11. READINESS REPORTS

All phase-completion and V1 readiness reports are **assembled from** Evidence Ledger records, Truth Status, the Decision Ledger, test/build results, external statuses, and known limitations — never written from narrative confidence.

Every material readiness claim must identify: current status; supporting evidence IDs; verification date; environment; known limitations; remaining action; required customer action; required external action; required professional review where applicable.

Where evidence is unavailable, report exactly one of: not evaluated; evidence required; customer information required; external verification required; professional review required; blocked. Never fill evidence gaps with assumptions.

---

## 12. GIT AND RECOVERY

Commit at stable, meaningful boundaries. Commit messages identify phase, implementation unit, capability, and important change. Never commit secrets, production credentials, invalid artifacts, knowingly broken stable branches, unnecessary build output, or local environment files containing secrets.

Before major refactors: verify status, commit stable work, create a recovery point. At phase completion: create a stable phase commit, a tag or equivalent checkpoint, and record the exit evidence. Continuous execution must never become one unrecoverable uncommitted change set.

---

## 13. DEPENDENCIES AND SCOPE CONTROL

Before adding a dependency: confirm the need; check whether the current stack already supports it; evaluate maintenance, security, compatibility, and bundle/runtime impact; prefer established, supported libraries; record architecturally significant additions in the Decision Ledger. Do not install broad libraries for one trivial function, create unnecessary vendor lock-in, or replace stable internal architecture because a new library exists.

When a new idea appears mid-implementation, classify it: required for current phase; required foundation for a later phase; useful enhancement; post-V1 candidate; Maximum Vision; rejected; insufficient evidence. Record valuable deferred ideas without expanding the active build. Do not delete future architecture merely because implementation is deferred.

---

## 14. COST AND RESOURCE GOVERNANCE

Track where available: model usage and cost, generation cost, repair-loop cost, infrastructure cost, build cost, storage cost, external-service cost, and estimated vs. actual recurring cost.

Prefer: deterministic validation over unnecessary model calls; targeted repair over full regeneration; relevant test subsets during implementation and complete validation at milestone/phase boundaries; cached or reusable structured artifacts where safe; small specialized context over repeatedly loading irrelevant history. Never reduce required quality merely to reduce cost, and never create agent activity merely to imitate a sophisticated organization.

Before any action that creates material external cost: estimate the cost, state the purpose, determine whether customer approval is required, and preserve budget controls.

**Milestone heartbeat (required):** at every milestone, produce a concise progress-and-spend summary — completed units, evidence status, notable findings, cost/usage where available, and the next milestone — and continue automatically. This summary informs the customer; it does not wait for a reply.

---

## 15. DUAL-MODE AND CUSTOMER-SUCCESS CONTINUITY

Every implemented customer capability defines: a Simple Mode experience, an Expert Mode experience, shared Product State, shared behavior, shared Truth Status, shared evidence, and mode-specific presentation and controls. Neither mode may maintain a contradictory implementation, and neither may be omitted for a major capability unless the Master Spec explicitly limits it. Simple Mode must complete the supported customer journey; Expert Mode must expose appropriate detail and control.

As implementation progresses, continuously verify the customer can: understand the product and its progress, make decisions, recover from failure, identify next actions, operate and monetize the generated product, connect required providers, launch through supported channels, understand costs, risks, and ownership, export their work, and understand what is real. Every phase must produce customer-visible value.

---

## 16. PHASE COMPLETION AND V1 EXECUTION

When a phase's implementation is complete: assemble the phase evidence, run complete required validation, commit and checkpoint, then **pause for the Level 3 independent phase-exit review defined in the Review Protocol**. Phase-exit review is the one designed pause in continuous execution; it is not a violation of the continuity mandate. The exit gate passes only on that review's evidence-backed acceptance — never on a completed checklist.

On exit-gate pass: produce the phase-completion report (implemented / verified / deferred / limitations / customer actions / next — assembled per §11), record evidence and known limitations, create the stable phase commit and tag, update execution state, and begin the next phase automatically.

After Phase 3 passes: run the Official V1 Acceptance Test; record every result; repair in-scope failures and rerun; then assemble (per §11, from evidence): Production Readiness; Known Limitations; Security Readiness; Privacy Readiness; Governance Readiness; Mobile and Distribution Readiness; Billing and Entitlement Readiness; Customer Ownership and Portability; Operational Readiness; Customer Success Readiness. Update final Truth Status; create the V1 release commit and tag; identify remaining customer actions, external approvals, and controlled-launch limitations. V1 readiness requires evidence-backed acceptance within supported scope — never merely that all phases contain code.

---

## 17. FINAL CONTINUATION RULE

Continue through the approved plan until one of the following is true:

* the Official V1 Acceptance Test passes;
* a phase exit is pending its independent Level 3 review;
* a genuine customer decision is required;
* a credential or external account is required and no unrelated work remains;
* a consequential action requires explicit approval;
* an external dependency blocks all remaining work;
* a critical architectural contradiction requires customer authority;
* continuing would create material cost, legal commitment, public publication, destructive impact, or unsupported risk;
* context constraint triggers the checkpoint protocol (§7).

When no genuine blocker exists: do not stop, do not ask whether to continue, do not wait for another prompt. Determine the next approved, unblocked implementation unit and proceed.

The objective is not uninterrupted code generation. The objective is continuous, disciplined, evidence-backed delivery of Pocket Studio from foundation through controlled commercial readiness.

— END OF DOCUMENT: POCKET STUDIO OFFICIAL EXECUTION PROTOCOL v1.0 —
