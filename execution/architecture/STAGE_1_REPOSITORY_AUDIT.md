# Stage 1 — Repository Audit: The 14-Concept Architecture Brief

**Scope:** Stage 1 only, per the brief's own instruction — "Do not modify code during Stage 1." This document contains no code changes and recommends none yet. It answers the brief's 7 required Stage-1 questions and the sharpened requirement given for this deliverable: _identify the minimum set of architectural primitives that can express all 14 proposed capabilities, prefer unifying concepts over new subsystems, and explicitly classify each of the 14 concepts as a first-class primitive or an emergent capability built from those primitives._

**Method, stated plainly (per the brief's own "do not invent repository state / do not claim a feature exists without evidence" constraints):** every claim below is backed by a file path, and most by a direct grep/read I performed in this session — not recalled from memory or inferred from naming alone. Where I checked whether a mechanism is actually _used_ (not just defined), I searched for real call sites outside the mechanism's own file and tests, not just its existence. That distinction — "modeled" vs. "populated" vs. "consumed" — turned out to matter more than expected; see §2.

---

## 1. The governing principle, already stated in the brief itself

The brief's own "Critical Architectural Principle" section proposes exactly the unification this audit was asked to evaluate: _"the Semantic App Graph may become the central model used by Glass Engine visualization, context resolution, dependency analysis, failure tracing, verification, change impact, and explanation... Project Memory may preserve the reasoning and history surrounding that graph... The Observation Layer may attach runtime evidence to graph nodes... The Business Model Graph may connect business concepts to technical implementation nodes."_

The single most important finding of this audit is that **this unification is not a proposal — it is already partially built**, under a different name, and the repository's own code comments already say so. See §2.1 and §2.5.

---

## 2. Per-concept findings (existence, partial-existence, different-name, missing)

### 2.1 Semantic App Graph — **PARTIALLY EXISTS, under the name "Product Knowledge Graph"**

`ProductKnowledgeNode` / `ProductKnowledgeEdge` (`prisma/schema.prisma:456-508`, service layer `src/lib/product/product-knowledge.ts`) is a real, tenant-isolated (verified: every function requires project access and both edge endpoints are checked to belong to the same project), generic typed graph. Ten node types are already modeled: `REQUIREMENT, WORKFLOW, SCREEN, ACTION, DATA_MODEL, PERMISSION, INTEGRATION, IMPLEMENTATION, TEST, EVIDENCE` — this maps closely onto the brief's own list (Screens, Components→Action, Features→Workflow, Database entities→DataModel, Permissions, Integrations, Backend services→Implementation, Tests).

What I found on closer inspection, not assumed from the schema:

- **Nodes are populated on every real generation**, but only 5 of the 10 types: `REQUIREMENT` (from `product-intelligence.ts:126`), `SCREEN`/`WORKFLOW`/`DATA_MODEL`/`ACTION` (from `blueprint-generator.ts:409-426`). `PERMISSION`, `INTEGRATION`, `IMPLEMENTATION`, `TEST`, `EVIDENCE` node types are defined but never instantiated anywhere in the codebase.
- **Zero edges have ever been created outside the edge-creation function's own file and tests.** I grepped for every call site of `createKnowledgeEdge`; there are none in the generation pipeline. The graph today is a flat, disconnected set of nodes — the relationships the brief's whole framing depends on ("what does it connect to? what depends on it?") do not exist in the data.
- **Zero consumers.** I grepped for every call site of `getKnowledgeGraph` and `listKnowledgeNodes`; there are none outside the file's own tests. Nothing in the app reads this graph — not Simple Mode, not Expert Mode, not any service, not the deployment gate, not the Quality Gate. It is write-only.
- **No Capability Registry entry exists for it.** It is an internal implementation detail today, not a disclosed platform capability.

This is the clearest "already exists, substantially unbuilt in the direction that matters" finding in this audit. The schema and the write path are sound; what's missing is edges, the remaining 5 node types, and — critically — any consumer at all.

### 2.2 Live Construction Graph / "Glass Engine" — **GENUINELY MISSING as a feature; its evidentiary backbone already exists**

No UI construct resembling the Glass Engine exists. But the brief's own hard requirement — _"if Pocket Studio says something happened, there should be evidence that it actually happened"_ — is already a first-class, mature, load-bearing pattern in this repository: the Event Ledger (`src/lib/product/events.ts`, `recordEvent`/`listEvents`) records real system actions (e.g. `GENERATION_COMPLETED`, `BLUEPRINT_VERSION_CREATED`), and the Evidence Ledger (`src/lib/product/evidence.ts`) plus Truth Status (`src/lib/product/truth-status.ts`) already enforce "never claim IMPLEMENTED without a real check having passed" throughout this entire codebase — this is precisely the discipline this whole session's semantic-hollowing repair extended, not invented. **What is missing is a live, streaming presentation layer** over these three already-real primitives — the app is currently server-rendered/Server-Action-driven with no push/streaming channel to the browser; a "watch it happen" UI has no transport to ride on yet.

### 2.3 Context-Aware Conversation — **GENUINELY MISSING**

No "what is the user currently viewing/selecting" state is tracked anywhere in this codebase, session-scoped or otherwise. No reference-resolution mechanism exists for "this"/"it". This is a real, unambiguous gap — there is nothing partially built here to point to.

### 2.4 Persistent Project Memory — **LARGELY EXISTS**

`ProductMemoryEntry` (`prisma/schema.prisma:441`, `src/lib/product/product-memory.ts`) is a real, discrete, typed, per-entry-deletable memory store. Its type enum — `FACT, REQUIREMENT, RECOMMENDATION, DECISION, REJECTED_OPTION, CONSTRAINT, PREFERENCE, HISTORY, LIMITATION, OPEN_QUESTION, CONTEXT` — maps almost one-to-one onto the brief's own list ("user decisions, product decisions, architecture decisions, assumptions, rejected approaches, feature rationale, previous changes, business context, unresolved questions"). The Decision Ledger (`src/lib/product/decisions.ts`) separately and more formally tracks approval-relevant decisions with `disclosureTier`/`approvalStatus`. Both are written to during real generation (confirmed: `product-intelligence.ts` calls `addProductMemoryEntry`). **What is missing:** a retrieval/query interface — nothing today can answer "why did we build subscriptions this way?" in natural language; the entries exist but only as a list, not a queryable, semantically-searchable record.

### 2.5 Dependency and Impact Intelligence — **PARTIALLY EXISTS on the wrong substrate, and the repository already says so**

`analyzeImpact()` (`src/lib/orchestration/impact-analysis.ts`) is a real, live, load-bearing function (confirmed callers: `change-set.ts`, `requirements-engine.ts`, `change-flow.ts`) — but it is a fixed 15-category, keyword-substring classifier, exactly the same shape of mechanism whose limitations this session's entire semantic-hollowing repair was about. Its own code comment, written well before this session, already states the intended fix: _"a deterministic, keyword-based foundation... to be replaced by real graph-based analysis over Product Knowledge relationships once Phase 2 populates them."_ Phase 2 and Phase 3 both completed without that migration happening — the Product Knowledge Graph (§2.1) still has no edges, so there was nothing to analyze against. This is the strongest single piece of evidence in this audit that the Semantic App Graph is the correct unifying primitive: the repository's own prior implementers already identified it as the target architecture and were blocked by the same prerequisite (populated edges) this audit independently identifies.

### 2.6 Intent → Plan → Execution → Verification — **LARGELY EXISTS, under the name "Orchestration Contract" / `beginChangeFlow`**

`src/lib/orchestration/change-flow.ts`'s `beginChangeFlow()` is a real, live function whose own docstring quotes a lifecycle nearly identical to this concept: _"User Intent → Load Canonical Product State → Resolve Intent → Determine Feasibility → Analyze Product and Business Impact → ... → Create Validated Change Set → Update Product State Atomically → Regenerate Affected Artifacts → Validate and Test → Create Evidence → Create Version → Update Truth Status → Respond Simply."_ The implementation already executes: intent resolution (`resolveIntent`, which itself loads existing Product State to distinguish first-time ideas from edits) → impact analysis → a disclosure-tier decision recorded in the Decision Ledger → conditional execution (immediate for ROUTINE/IMPORTANT, gated on approval for CONSEQUENTIAL) → generation or Change Set application. **What is not wired into this same function today:** the Verification step (Quality Gate is never called from inside `beginChangeFlow`) and the Memory Update step (no `ProductMemoryEntry` is written here) — both exist elsewhere in the codebase as separate, disconnected call sites, not as the final two stages of this one orchestrated flow.

### 2.7 Reversibility / Feature-Level Time Travel — **PARTIALLY EXISTS, at the wrong granularity**

Blueprint has real, tested version history and restore (`previewBlueprintRestore`/`restoreBlueprintVersion`, P2-09) — a founder can already revert an entire Blueprint to a prior version with a real diff shown first. Build Plan and Product State have no restore function. Nothing at any granularity below "the whole Blueprint" exists — there is no way to revert "just yesterday's onboarding changes" as the brief's own example requires. This depends on the Semantic App Graph existing and being snapshotted per change before it can be built (a "feature" is a semantically-scoped subgraph; today, nothing identifies subgraphs at all).

### 2.8 Environment Awareness — **PARTIALLY EXISTS at the deployment layer; GENUINELY MISSING at the data layer**

`DeploymentEnvironment` (`DEVELOPMENT | PREVIEW | STAGING | PRODUCTION`, `prisma/schema.prisma:1406`) is real and enforced — I confirmed a live `ProductionDeploymentBlockedError` gate in `src/lib/deployment/deployments.ts:66` keyed off `quality.gate` Truth Status, exactly the kind of dangerous-ambiguity prevention the brief asks for, but scoped only to the deployment audit-trail record itself.

Checked directly against the brief's own example ("delete all test customers must never accidentally delete production customers"): `GeneratedRecord` (`prisma/schema.prisma:1514`) — the actual data store for a generated application's runtime data — has **no environment field at all**. Data is scoped only by `projectId`. There is today no way to even represent "this row belongs to staging" vs. "this row belongs to production" for a customer's generated app data. This is a genuine, unambiguous gap, not a naming or wiring issue — nothing exists to extend here; it requires a new scoping dimension threaded through the generated-app data layer, the same way `projectId` already threads through everything for tenancy.

### 2.9 Secrets and Ownership — **LARGELY EXISTS, and is the most mature of the 14**

The `CredentialReference` vault (AES-256-GCM encrypted secret storage) + `IntegrationRequirement` + the real OAuth2 authorization-code flow (P3-05) already establish exactly the boundary the brief describes, plus a deliberate, explicitly-reviewed "no-actor exception" pattern for the narrow cases where a system process (not a human) must legitimately decrypt a secret (`applyBillingLifecycleEventFromWebhook`, `authenticateGeneratedAppUser`, `createGeneratedAppCharge`) — each one individually added to the tenant-isolation static-analysis tool's reviewed exception list, not silently exempted. What's missing is a founder-facing explanation surface ("what do I own vs. what is Pocket Studio authorized to access") — a disclosure/UI gap, not a backend one.

### 2.10 Verification Engine — **LARGELY EXISTS, under the name "Quality Gate"**

`runQualityGate()` (`src/lib/generation/quality-gate.ts`) already generalizes to exactly the shape the brief describes: a growing set of real checks (12, after this session's semantic-fidelity addition), each mapped to one of 6 real dimensions, each dimension independently recorded to Truth Status — never a self-report. This pattern already gathers real evidence rather than merely claiming success (confirmed directly, extensively, throughout this session's own work). What's missing is applying this same pattern to _live, post-deployment_ verification (signup works, payments work, webhooks fire, in a real running instance) — today every check is static/generation-time only. This is a new _instance_ of an existing pattern, not a new architecture.

### 2.11 Failure Intelligence — **GENUINELY MISSING — and must not be confused with the existing `IncidentReport` mechanism**

`IncidentReport` (`src/lib/observability/incident-response.ts`) is real, but it is **Pocket Studio's own platform operational-incident tracking** (platform-admin-only, manually reported, no live monitoring integration) — a completely different scope from what this concept describes: tracing a _customer's_ application failure causally through its own architecture (_"Customer → Checkout → Payment successful → Webhook received → Database update FAILED"_). Nothing in this codebase does that. This is worth stating explicitly because the names are close enough to invite false confidence that this concept is already covered — it is not.

### 2.12 Human Approval Boundaries — **LARGELY EXISTS, under the name "Decision Ledger disclosure tiers"**

The Decision Ledger's three-tier system (`ROUTINE | IMPORTANT | CONSEQUENTIAL`, the last defaulting to `PENDING_APPROVAL`) already implements risk-tiered approval gating generally, and is already used for exactly the kind of high-risk actions the brief lists (billing changes, consequential product decisions). The separate Quality-Gate-keyed production-deployment gate (§2.8) is a second, narrower instance of the same idea for one specific high-risk action. What bottlenecks this concept's maturity is the same thing that bottlenecks §2.5: risk classification today is driven by `impact-analysis.ts`'s keyword categories, not real graph/business understanding.

### 2.13 Business Model Graph — **PARTIALLY EXISTS as disconnected, non-graph pieces**

`business-intelligence.ts`, `unit-economics.ts`, and `assessBusinessHealth` (referenced by `continuous-product-agent.ts`) already compute real, deterministic business findings from real platform data (payments, subscriptions) — this is genuine, tested, working logic, not a stub. But none of it is represented as graph nodes, and none of it connects to the Product Knowledge Graph — it exists as flat computed objects (`businessModelBrief`, health-check findings), not as an acquisition→signup→activation→conversion→retention→churn structure a founder could navigate or ask "what depends on this" about.

### 2.14 Observation Layer — **PARTIALLY EXISTS, and already shaped exactly as the brief's own unification hint suggests**

`ProductOutcomeRecord` (`prisma/schema.prisma:518`, `src/lib/product/product-outcomes.ts`) is a real, versioned-adjacent (append-only, timestamped) fact store — `metricKey`, `value`, `source` — with a nullable, `SetNull`-on-delete foreign key directly into `ProductKnowledgeNode`. This is, concretely, already the exact "Observation Layer attaches runtime evidence to graph nodes" unification the brief itself proposes as an example — not a coincidence; whoever built P3-14 was clearly working from the same Master Spec section this brief also draws from. **What's missing is population from any live signal.** I confirmed zero call sites for `recordProductOutcome` outside its own file and tests — the only writer is a manual, on-demand snapshot function (`recordProductAnalyticsSnapshotAsOutcomes`), and nothing calls that automatically either. This is honestly disclosed in the platform's own Capability Registry entry (`platform.product_outcome_and_continuous_agent_foundation`, `PROTOTYPE_ONLY`) — this audit did not discover a hidden gap here so much as confirm a disclosed one.

Relatedly: `proposeContinuousProductRecommendations()` (`src/lib/product/continuous-product-agent.ts`) is a real, bounded, already-reviewed pattern worth naming explicitly as a template for any future autonomous-adjacent behavior — it reuses the deterministic `assessBusinessHealth` findings (never AI-generated free text), and only ever _proposes_ through the existing Decision Ledger at `CONSEQUENTIAL` tier, never auto-applying, never touching `approvalStatus` itself, never running on a schedule (no scheduled-job infrastructure exists in this build at all — a disclosed gap shared with several other Phase 3 units). This is exactly the "propose, never silently mutate" discipline the brief's Non-Negotiable Constraints require for any future agent-like capability.

---

## 3. Minimum Primitive Set — the sharpened deliverable

Applying "prefer unifying concepts over introducing new subsystems" against the findings above, the 14 concepts reduce to **6 first-class primitives**, of which **5 already exist in the repository today and require extension, not invention** — only one (Environment Awareness as a data-layer concern) requires building something genuinely new.

| #   | Primitive                                                                        | Existing repository mechanism to extend                                                   | Status                                                                                                            |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P1  | **Semantic App Graph**                                                           | `ProductKnowledgeNode` / `ProductKnowledgeEdge`                                           | Exists, unbuilt in the direction that matters (no edges, no consumers, 5/10 node types populated)                 |
| P2  | **Persistent Reasoning Record** (Decision Ledger + Product Memory)               | `Decision` + `ProductMemoryEntry`                                                         | Exists, live-written, missing only a retrieval interface                                                          |
| P3  | **Orchestrated Change-Flow lifecycle**                                           | `beginChangeFlow` (`change-flow.ts`)                                                      | Exists, live, missing the Verification + Memory-Update stages inside the same function                            |
| P4  | **Environment-scoped data partitioning**                                         | _(none — new)_                                                                            | Genuinely missing at the `GeneratedRecord`/`GeneratedAppUser` layer; exists only for the `Deployment` audit trail |
| P5  | **Secrets, Credentials & Provider Abstraction**                                  | `CredentialReference` vault + `IntegrationRequirement` + the provider-abstraction pattern | Exists, mature, already the most-reviewed subsystem in the codebase                                               |
| P6  | **Verification & Truth** (Quality Gate pattern + Evidence Ledger + Truth Status) | `runQualityGate` + `evidence.ts` + `truth-status.ts`                                      | Exists, mature, generation-time only                                                                              |

### Classification of all 14 concepts

**First-class primitives (6):**

| Concept                                     | Primitive | Why it cannot be reduced further                                                                                                                         |
| ------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 Semantic App Graph                       | **is** P1 | Foundational — the brief's own text names it as the thing everything else connects to                                                                    |
| #4 Persistent Project Memory                | **is** P2 | A genuinely distinct kind of state (why something was decided) that the graph (what currently exists) and verification (whether it works) cannot express |
| #6 Intent → Plan → Execution → Verification | **is** P3 | The control-flow spine that invokes and updates every other primitive — not itself derivable from them                                                   |
| #8 Environment Awareness                    | **is** P4 | A scoping dimension, structurally like tenancy — cannot be expressed as a graph query or a memory entry; must be threaded through the data layer itself  |
| #9 Secrets and Ownership                    | **is** P5 | A security/access-boundary concern, categorically different from knowledge representation or verification                                                |
| #10 Verification Engine                     | **is** P6 | Evidence-gathering is a distinct concern from what-exists (graph) or why-it-exists (memory)                                                              |

**Emergent capabilities (8) — built by composing the primitives above, requiring no new subsystem:**

| Concept                               | Emergent from                                                           | What's actually needed                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2 Glass Engine                       | P1 + P6 (Event Ledger, part of Verification & Truth)                    | A live/streaming presentation layer only — no new backend model                                                                                                                                                                                                                             |
| #3 Context-Aware Conversation         | P1 + P3                                                                 | A small "current selection" pointer into graph nodes, resolved by P3's Intent-Resolution step                                                                                                                                                                                               |
| #5 Dependency and Impact Intelligence | P1                                                                      | Directly replaces `impact-analysis.ts`'s keyword classifier once P1's edges are populated — the repository's own code comments already say this is the intended direction                                                                                                                   |
| #7 Reversibility                      | P1 + P2                                                                 | Feature-level revert = snapshot a graph subregion + the Decision Ledger entry that produced it; today's Blueprint-only restore is the existing primitive to extend                                                                                                                          |
| #11 Failure Intelligence              | P1 + P6 + #14 (Observation Layer)                                       | Causal tracing = graph traversal + verification state + observed runtime signals; must not be confused with the unrelated `IncidentReport` mechanism                                                                                                                                        |
| #12 Human Approval Boundaries         | P2 (Decision Ledger tiers) + P3                                         | Already fully generalized via `disclosureTier`; maturity is bottlenecked by #5's same keyword-classifier limitation                                                                                                                                                                         |
| #13 Business Model Graph              | P1 (new node/edge types)                                                | New business-concept node types on the _same_ graph engine, populated by the already-real `business-intelligence.ts`/`unit-economics.ts` calculators — "distinct from, but connected to" per the brief's own framing, read as one engine, one additional semantic layer, not a second graph |
| #14 Observation Layer                 | P1 (`ProductOutcomeRecord`'s existing FK) + real runtime signal sources | The data model already exists in exactly this shape; only population from live signals is missing                                                                                                                                                                                           |

---

## 4. Answers to the brief's 7 required Stage-1 questions

1. **Which concepts already exist:** #9 (Secrets/Ownership), #10 (Verification Engine), #12 (Human Approval Boundaries) — all mature, live, and load-bearing today, under different names (Credential vault, Quality Gate, Decision Ledger disclosure tiers).
2. **Which partially exist:** #1, #4, #5, #6, #7, #8 (deployment layer only), #13, #14 — see §2 for the specific gap in each.
3. **Which are already planned under different names, in the repository's own words:** #5 (Dependency/Impact Intelligence) — `impact-analysis.ts`'s own comment explicitly names the Product Knowledge Graph as its intended replacement. #14 (Observation Layer) — `ProductOutcomeRecord`'s own schema comment and foreign key already implement the brief's suggested graph-attachment design.
4. **Which are genuinely missing:** #2 (Glass Engine's presentation layer — though its evidence backbone exists), #3 (Context-Aware Conversation), #8 (environment-scoped data partitioning specifically — the deployment-layer piece exists), #11 (Failure Intelligence, not to be confused with `IncidentReport`).
5. **Which ideas would conflict with the current architecture:** None outright conflict. The one real risk is #11/#13/#14 being built as _separate_ graphs or tracking systems instead of extensions of the existing Product Knowledge Graph — that would directly violate the brief's own "avoid unnecessary duplication" constraint and would conflict with `impact-analysis.ts`'s own already-stated intent to consolidate onto that graph.
6. **Which ideas should be merged rather than implemented separately:** #1/#5/#7/#11/#13/#14 all belong on one graph engine (P1), not six. #4/#12 belong on one reasoning-record primitive (P2), not two.
7. **Which ideas are premature for the current milestone:** #2 (Glass Engine) and #3 (Context-Aware Conversation) both depend on P1 having real, populated edges and at least one real consumer first — building either before that would create exactly the kind of "abstraction with no immediate consumer" the brief's own Non-Negotiable Constraints forbid. #11 (Failure Intelligence) additionally depends on #14 having real runtime signals, which depend on infrastructure (scheduled jobs, live monitoring) this build does not have at all yet, per the already-disclosed gap noted in `platform.product_outcome_and_continuous_agent_foundation`'s own Capability Registry entry.

---

## 5. What this document does not do

Per the brief's own structure, this is Stage 1 only. It does not propose which primitive to build first, does not define new schemas, does not estimate effort, and does not recommend an implementation slice — that is Stage 2 and Stage 3's job, and the brief is explicit that Stage 2 should be "grounded in the actual repository" (this document) before being written. No code was modified to produce this audit.
