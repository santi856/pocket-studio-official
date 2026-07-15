# Semantic Product Compiler — Pre-Implementation Report

**Trigger:** founder-discovered defect (HomeBase household-management app). Full founder request, root-cause evidence, and defect classification: `execution/final-audit/homebase-defect-evidence.json`, Evidence Ledger `EV-0110`, Decision Ledger `D-0065`.

**Scope of this report:** the 20 items required before touching application architecture. Written from direct code reads and one live, unmodified reproduction of the founder's exact HomeBase description through the real pipeline — not from filenames, comments, or prior reports.

---

## 1. Root cause

Pocket Studio's generation pipeline has **no representation of product meaning** between raw idea text and a fixed 15-category keyword classification. Everything downstream of that classification — Blueprint content, roles, data models, workflows, Quality Gate, Truth Status — operates only on which of ~90 fixed keywords happened to appear in the customer's text, never on the actual actors, entities, relationships, or workflows the text describes. The pipeline was never semantically hollow _for HomeBase specifically_; it has no mechanism to be anything else for _any_ description that doesn't use its specific keyword set.

## 2. Exact stage where HomeBase's meaning was lost

Traced live (raw text → persisted artifacts), with the real HomeBase description run through the unmodified pipeline:

| Stage                 | File                                                                    | What happened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw idea text         | —                                                                       | Full HomeBase paragraph: explicit Parent/Child actors, 6 named domain entities (chores, grocery lists, expenses, appointments, schedules, rewards), an explicit recurring-assignment workflow, an explicit dashboard.                                                                                                                                                                                                                                                                                                                                                                         |
| Impact Analysis       | `src/lib/orchestration/impact-analysis.ts` `analyzeImpact()`            | **Meaning lost here, primarily.** Matched only 2 of 15 categories (`screens` via the word "view", `costs` via "expense"). `data`, `permissions`, `workflows`, `monetization`, `actions`, `businessLogic` all failed — none of their fixed keyword lists (`record`/`database`/`field`/`schema`; `role`/`permission`/`access control`; `workflow`/`flow`/`process`; `payment`/`subscription`/`membership`/etc.) happen to appear verbatim in the text, even though every one of those categories is semantically present.                                                                       |
| Target customer       | `requirements-engine.ts` `extractTargetCustomer()`                      | Single regex `/\bfor\s+(.+?)(?:[.!?]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | $)/i` found no match → target customer empty, despite "busy families," "Parents," "Children" being present throughout. |
| Requirements Engine   | `requirements-engine.ts` `deriveRequirements()`/`deriveOpenQuestions()` | Produced 2 inferred + 1 recommended requirement (from the 2 matched categories only). Asked "Does this product need more than one user role?" verbatim — reproduced live — despite Parent/Child being named explicitly, because the question is gated only on whether the `permissions` _category_ matched, never on the text itself.                                                                                                                                                                                                                                                         |
| Blueprint generation  | `blueprint-generator.ts` + `blueprint-templates.ts`                     | Each matched category maps to one of a small set of **fixed, generic templates** — the `data` category's template is always the literal `{name:"Record",fields:["id","status","createdAt"]}`, never derived from the actual nouns in the text. Since `data` didn't even match, the existing D-0045 fallback substituted the same generic Record anyway. `permissions` not matching meant `roles:["customer"]` only. Result, live-confirmed: `roles:["customer"]`, `screens:["Home","Browse"]`, `dataModels:[Record]`, `workflows:[]`, `actions:[]`, `businessRules:[]`, `ownerOperations:[]`. |
| Blueprint validation  | `blueprint-validation.ts` `validateBlueprint()`                         | Purely structural (non-empty arrays, valid output targets, well-formed interaction contracts). Zero requirement-to-content correspondence check. Returned `VALID` — correctly, by its own narrow contract, which its own docstring already discloses: "cannot judge whether content is a good design."                                                                                                                                                                                                                                                                                        |
| Quality Gate          | `quality-gate.ts` `runQualityGate()`                                    | 11 structural checks (data-binding present, alt text present, screens reachable, buttons wired). Zero semantic-coverage dimension. Live-confirmed: `passed: true`, all 11 checks `true`, for the Blueprint above.                                                                                                                                                                                                                                                                                                                                                                             |
| Business Intelligence | `business-intelligence.ts`                                              | `revenueModel: "No revenue model was described"` (fact) computed independently from `monetizationRecommendations: [{option:"one-time payment"}]` (a recommendation always included when monetization wasn't detected). Both individually correct.                                                                                                                                                                                                                                                                                                                                             |
| Studio UI             | `src/app/org/[orgSlug]/[projectSlug]/page.tsx:280,295-309`              | Renders both fields adjacently with no fact-vs-recommendation label — this is where the founder's perceived _contradiction_ (not just thinness) originates.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Truth Status          | `truth-status-sync.ts` / `generation-orchestrator.ts`                   | `IMPLEMENTED`, rationale "Blueprint v1 and Build Plan v1 are ready; screens are live at /preview/<screen>." Technically accurate about what was generated; readable as "HomeBase was implemented."                                                                                                                                                                                                                                                                                                                                                                                            |

## 3. Existing systems that should be extended, not replaced

- **`AIProvider` interface** (`src/lib/ai/provider.ts`, `anthropic-provider.ts`, `mock-provider.ts`, `get-provider.ts`) — already the exact right shape: one interface, forced-tool-use structured output, real vs. mock swap via `AI_PROVIDER`, real usage/cost tracking, real error types, 30s timeout. **This is the load-bearing discovery of this audit**: `resolveIntent()` already calls a real AI provider on the live path (`beginChangeFlow` → `resolveIntent`) — but its result is used **only to classify `describe_idea` vs. `edit_request`**, then discarded. `generateProductIntelligence` and `generateInitialBlueprint` both independently re-derive everything from raw text via the deterministic keyword pipeline, never touching whatever the AI understood. **The semantic-extraction call belongs on this same interface**, reusing its proven pattern exactly, not a new framework.
- **Feasibility Engine + Capability Registry** (`feasibility.ts`, `capability-registry.ts`) — takes a flat `capabilityKeys: string[]`, checks each against the registry, never invents support. Unchanged; the semantic model just needs to produce a richer capability-key list than today's category→key mapping.
- **Interaction Contract System** (`interaction-contracts.ts`) — the existing practical-completeness mechanism (5 patterns × 7 states, required/conventionally-implied/recommended/optional/consequential/unresolved). Unchanged in mechanism; needs to run against semantic-model workflows instead of a bare category list, per the founder's own Part 9 instruction.
- **Decision Ledger, Product Knowledge, Product Memory** — unchanged; the semantic model's actors/entities/workflows become the source that populates `createKnowledgeNode` calls (already present in `blueprint-generator.ts`), replacing today's thin category-derived nodes with richer ones.
- **Quality Gate** (`quality-gate.ts`) — extended with new checks, not replaced; its existing 11 checks remain valid and necessary.
- **Truth Status** (`truth-status.ts`, `truth-status-sync.ts`) — extended with new dimensions (§11 of the founder's spec), existing subject keys/mechanism unchanged.
- **Blueprint/ProductState schema pattern** — versioned, append-only, heavily JSON-columned, `schemaVersion` field already present on `Blueprint`. The new semantic model follows this exact pattern rather than inventing a new persistence style.

## 4. Existing systems that must not be duplicated

- **Product State** stays the raw-idea + business-intelligence + feasibility container it already is. The semantic model is a _new, distinct_ artifact that sits between Product State and Blueprint — it does not re-implement Product State's job (capturing what the customer said and the business analysis of it).
- **Product Knowledge** stays the graph-relationship layer. The semantic model feeds it; it does not become a second graph.
- **Decision Ledger** stays the single approval/disclosure mechanism. Consequential items the semantic model surfaces route through it exactly as today's `openDecisions` do — no parallel approval system.
- **Capability Registry / Feasibility Engine** stay the single source of truth for what's supported. The Semantic Coverage Engine (§7 below) reports coverage; it does not decide feasibility.
- **No new "agent" persistence layer.** Per §10 below, this is one new AI-provider method plus one new deterministic engine — not a multi-agent runtime with its own state machine.

## 5. Why current tests passed

The relevant tests (e.g. `official-demonstration.integration.test.ts`) were deliberately calibrated to assert the deterministic pipeline's known, narrow, honest output as a _regression baseline_ — the test file's own module comment states this explicitly ("this test intentionally does NOT assert §56's full ... lists are produced, because they are not"). These tests correctly prove the deterministic pipeline is internally consistent and hasn't silently regressed; they were never designed to, and cannot, catch semantic hollowing against an arbitrary description, because no test in the suite compares generated output back against source-text meaning. That comparison mechanism did not exist before this work.

## 6. Why Blueprint `VALID` was inaccurate/incomplete

Not inaccurate relative to its own contract — `validateBlueprint()`'s docstring already says "structural validation only... cannot judge whether its content is a good design." It is **incomplete** as the sole gate a customer-facing claim ("Blueprint v1: VALID") relies on, because no second, semantic gate exists to catch the case a structural gate cannot.

## 7. Why Build Plan `READY` was inaccurate/incomplete

Same root cause one layer down — `build-planner.ts`'s `planStatus` is `BLOCKED` only for structural blockers (invalid Blueprint, unsafe capability, unresolved consequential decision), never for "this plan represents 5% of the described product."

## 8. Why the Quality Gate passed

Confirmed live: all 11 checks are structural (binding, alt text, reachability, wiring). None of them compares the Blueprint/Build Plan back to the original idea text. A Blueprint with one generic screen and one generic entity passes every check as cleanly as a rich one, because "clean" and "complete" are different properties and only the first is checked today.

## 9. Why Truth Status overstated the result

`IMPLEMENTED` is a true statement about _what was generated_ and a misleading one about _how much of the request it represents_, because Truth Status has never had a dimension for the second question. Confirmed: this is a real gap, not a bug in the sync logic — the rationale text is accurate; the customer-facing conclusion it invites is not.

## 10. Recommended architecture

**Reject the six-agent proposal as specified. Recommend two new pieces, not six:**

1. **One new `AIProvider` method** — `extractProductSemantics(input): Promise<SemanticExtractionResult>` — added to the existing interface exactly like `resolveIntent`: forced tool-use, Zod-validated structured output, real usage tracking, honest mock fallback. This single call covers the founder's proposed **Product Understanding Agent** and **Product Architect Agent** roles combined. Justification for merging them: the deterministic layers downstream (Blueprint templates → Component Registry → Build Planner) already perform "architecture from structured input" today, just from a thin input (`ImpactCategory[]`). Feeding those same deterministic layers a _richer_ structured input (the semantic model) is a smaller, safer change than adding a second AI round-trip to re-derive architecture the deterministic layer is already responsible for and already tested for. A second AI call here would add latency and cost without a demonstrated gap it uniquely closes.

2. **One new deterministic Semantic Coverage Engine** (`semantic-coverage.ts`) — covers the founder's proposed **Semantic Fidelity Critic** and **Verification Agent** roles combined, as a deterministic comparator (not a second AI agent), per the founder's own instruction that "deterministic validators remain the final enforcement authority." It compares each semantic-model item's provenance span against the source text and reports per-dimension coverage (§7 of the founder's spec). This is cheap, fast, fully reproducible in tests, and requires no live AI credentials to run in CI.

**The founder's remaining three proposed roles are existing systems, not new agents:**

- **Practical Product Completeness** → the existing Interaction Contract System, fed semantic-model workflows instead of a category list. No new agent.
- **Feasibility and Capability** → the existing Feasibility Engine + Capability Registry, fed a richer capability-key list. No new agent.
- Sequential execution (extract → deterministic-map → deterministic-validate) is sufficient; no parallel critique step is justified by evidence gathered so far. If the Semantic Coverage Engine's own gate is repeatedly borderline in real use, a second, narrowly-scoped adversarial AI call _could_ be added later as a bounded, conditional step — not built speculatively now.

**Cost/latency control**: one AI call per idea submission or edit request (same call site `resolveIntent` already occupies), not per-screen or per-entity. Bounded retries (2, per existing patterns), 30s timeout (existing constant), structural schema validation rejects malformed output without a second network round-trip (falls back to deterministic + honest low-coverage labeling instead of retrying blindly).

**Recursion**: none — one AI call, then a strictly one-directional deterministic pipeline (semantic model → Blueprint → Build Plan → Quality Gate). No loop where a gate failure re-invokes the AI call automatically (that would risk uncontrolled cost/latency); a failed coverage gate surfaces as `openDecisions`/Truth Status, the same disclosure path every other unresolved item already uses.

## 11. Canonical semantic-model design

New model, following the existing `Blueprint`/`ProductState` pattern exactly (append-only, versioned, JSON-columned, `schemaVersion` field):

```prisma
model ProductSemanticModel {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  version   Int

  schemaVersion String

  purpose      String?
  targetUsers  Json?
  actors       Json?   // ActorSpec[]
  entities     Json?   // EntitySpec[] (concept, attributes, relationships, lifecycle states)
  workflows    Json?   // WorkflowSpec[] (steps, triggers, recurrence, deadlines)
  capabilities Json?   // CapabilitySpec[] (actions, commands, events, notifications, dashboards, reports, search/filter/sort)
  permissions  Json?   // PermissionSpec[] (actor x entity/action x visibility)
  businessRules Json?
  monetization  Json?
  integrations  Json?
  constraints   Json?

  // Every material item across the fields above carries its own inline
  // provenance object (source excerpt, sourceType, confidence, requirementId)
  // rather than a separate table — mirrors how Blueprint already inlines
  // generationMetadata rather than a side table.
  unresolvedQuestions      Json?
  consequentialDecisions   Json?
  unsupportedRequirements  Json?

  generationMetadata Json  // provider, model, promptVersion, generatedAt, mode: "ai" | "deterministic_fallback"
  coverageResult     Json? // written by the Semantic Coverage Engine after extraction

  basedOnProductStateVersion Int

  createdAt       DateTime @default(now())
  createdByUserId String

  @@unique([projectId, version])
  @@index([projectId])
  @@map("product_semantic_models")
}
```

Sits **between** `ProductState` and `Blueprint` in the pipeline. Does not replace either. `Blueprint.generationMetadata` gains a `basedOnSemanticModelVersion` field so every Blueprint is traceable back to the semantic model that produced it (and, transitively, to Product State and the original idea) — the same versioned-chain pattern `Blueprint.basedOnProductStateVersion`/`basedOnProductDnaVersion` already use.

**Provenance shape** (inline on every material item, per the founder's exact required fields):

```ts
type Provenance = {
  requirementId: string; // stable, e.g. "req_<8-char-hash-of-normalized-statement>"
  sourceExcerpt: string; // bounded, e.g. max 200 chars from rawIdea
  sourceType:
    | "customer_explicit"
    | "customer_confirmed"
    | "low_risk_inference"
    | "recommendation"
    | "unresolved"
    | "consequential_decision"
    | "system_constraint";
  confidence: "high" | "medium" | "low";
  generationProvider: "mock" | "anthropic";
  model: string | null;
  semanticModelVersion: number;
  validationStatus: "unvalidated" | "coverage_confirmed" | "coverage_flagged";
};
```

No chain-of-thought stored — only structured conclusions + a bounded source excerpt + the above metadata, matching the existing `assumptions`/`openDecisions` string-array convention already used on `Blueprint`.

## 12. Traceability design

Every `DerivedRequirement`-equivalent item gets a stable `requirementId` (deterministic hash of its normalized statement + category, not a random cuid, so the same requirement re-extracted from the same text is idempotently identifiable across regenerations). The ID threads through: semantic-model item → Blueprint content (each screen/role/dataModel/workflow gains an optional `sourceRequirementIds: string[]` field in its JSON shape) → Build Plan tasks (already have per-task structure to attach IDs to) → generated tests (test names/IDs reference the requirement) → `ProductEvidence` (existing model, already has a free-form `data` JSON) → Truth Status (existing `TruthStatusEntry`, subject key extended to allow a per-requirement key alongside today's per-capability key, e.g. `requirement.<requirementId>`).

Survival across conversational edits/restore/export: since the semantic model is itself versioned and append-only like Blueprint, and Change Sets already record `addedCategories` by diffing, the Change Set mechanism is extended to diff semantic-model items (not just categories) — a requirement's ID is stable across versions unless its source text is materially edited, in which case it's marked `superseded` (never silently dropped) and a new ID is created, both retained in history. Restore/export already operate on whole versioned rows, so restoring an old semantic-model version naturally restores its requirement IDs.

## 13. Semantic-coverage design

`semantic-coverage.ts`, deterministic, no AI call. For each of the founder's 19 listed dimensions, computes `covered | partially_covered | unresolved | unsupported | deferred | missing` by checking whether the semantic model contains at least one item of the relevant kind with `sourceType` in `{customer_explicit, customer_confirmed, low_risk_inference}` and, separately, whether that item's downstream Blueprint artifact actually exists (e.g. an `actor` item is `covered` only if a matching entry exists in `Blueprint.roles`, not merely in the semantic model — closing exactly the gap where information "existed but was ignored," per the founder's own diagnostic list in Part 2). Reports the exact artifact providing coverage (file + field), not just a boolean.

**Blueprint validation gate** (`validateBlueprint`, extended, not replaced): adds one new check category, "semantic coverage," which fails when: a `customer_explicit` actor/role is `missing`; a primary journey (a workflow with `sourceType: customer_explicit`) is `missing`; more than a configured threshold of `customer_explicit` entities collapsed into the generic placeholder ("Record") without an accompanying `openDecision`. Below-threshold-but-nonzero coverage does not hard-fail (many real ideas are legitimately terse) — it produces `openDecisions`/Truth Status entries, consistent with the existing disclosure-not-silent-failure pattern everywhere else in this codebase.

## 14. Cost and latency strategy

One AI call per `describe_idea`/`edit_request` (same call site as today's `resolveIntent`, in fact the two can be combined into one tool call returning both intent classification and semantic extraction, halving round-trips relative to two separate calls). Real token usage recorded exactly as today (`recordAiUsageEvent`). No retries beyond a bounded 2 attempts on a schema-validation failure (matching `AnthropicResponseFormatError` handling already present); on final failure, falls back to the deterministic extractor with `generationMetadata.mode: "deterministic_fallback"` set and surfaced honestly in Truth Status — never silently substituted.

## 15. Failure and fallback behavior

If `AI_PROVIDER=mock` (default) or a live call fails after retries: the deterministic fallback extractor runs — a **modest upgrade** of today's keyword classifier (adds simple, language-generic heuristics: capitalized multi-word noun-phrase detection for candidate entities, "X can/have/manage" clause detection for candidate actors, verb-initial clause detection for candidate workflow steps) but every item it produces is tagged `sourceType: low_risk_inference` at best, `confidence: low`, and `generationMetadata.mode: "deterministic_fallback"`. This is a genuine, disclosed, reduced-intelligence mode — not a second attempt to fake AI-level understanding with more keywords, and the Semantic Coverage Engine reports its (expected, honestly lower) coverage rather than hiding it.

## 16. Migration and backward-compatibility impact

Additive only: one new table (`ProductSemanticModel`), one new nullable JSON field on `Blueprint` (`generationMetadata.basedOnSemanticModelVersion` — no schema change needed, it's already JSON), no change to any existing column type, no data migration required for existing projects (they simply have no semantic-model rows; the pipeline falls back to today's category-only path when none exists, so old projects keep functioning exactly as before until they're regenerated). `validateBlueprint`'s new check is additive and only activates when a semantic model is present, so it cannot regress any existing test that doesn't supply one.

## 17. Regression strategy

1. Every existing test keeps passing unmodified wherever it doesn't supply a semantic model (proves backward compatibility).
2. `official-demonstration.integration.test.ts`'s existing assertions (`screens:["Home","Browse"]`, generic `Record` model) are **not deleted** — they're preserved as the documented deterministic-mode baseline, since the mock provider is still the default and that sentence still under-specifies most categories even under the new heuristics.
3. New tests assert the mock-mode upgraded extractor against HomeBase reaches materially better (not perfect) coverage than today's baseline, with honest `low` confidence throughout.
4. New tests assert the real-AI-mode path (against a scripted fake Anthropic response, same harness style as existing AI provider tests) produces high-coverage, high-confidence extraction for HomeBase specifically, since this is the fixture the founder used to discover the defect and it must not silently regress.
5. Part 12's 9-fixture multi-domain corpus (built after this repair) is the actual regression gate for generalization — not a HomeBase-specific hardcode, per the founder's explicit prohibition.

## 18. Risks

- **Touches the core generation pipeline every prior phase's evidence depends on.** Mitigated by additive-only schema design (§16) and keeping the deterministic path fully intact as the default/fallback.
- **AI-backed extraction is non-deterministic across calls even with the same input**, unlike everything else in this codebase's test suite. Mitigated by testing the AI path only against scripted fixture responses (never live API calls in the automated suite — consistent with existing `anthropic-provider.test.ts` practice), and by the Semantic Coverage Engine being fully deterministic regardless of which mode produced its input.
- **Cost**: real AI calls now happen on the primary idea-submission path, not just intent classification, meaning existing content is being sent to a real model, which was already true for `resolveIntent`'s `rawText` — this is not a new data-exposure surface, only a fuller use of the same one.
- **Scope creep risk**: the founder's 19-dimension coverage list is large; if built as one monolithic pass, it will be slow to review and hard to test. Mitigated by implementing dimensions incrementally, in the priority order in §20, each independently tested.
- **The generic "Record" fallback must not be deleted** — it is a legitimate degraded-mode safety net (Level 3 review round 3 already relied on it to keep Home/Browse from permanently failing the Quality Gate for genuinely terse ideas). The repair adds a better primary path; it does not remove the existing fallback.

## 19. Smallest correct implementation sequence

1. Prisma migration: add `ProductSemanticModel` (additive).
2. `SemanticExtractionResult` type + Zod schema (`src/lib/ai/provider.ts`).
3. `AnthropicAIProvider.extractProductSemantics()` — same forced-tool-use pattern as `resolveIntent`.
4. `MockAIProvider.extractProductSemantics()` — honest, modestly-upgraded deterministic fallback (§15), never claiming high confidence.
5. `semantic-model.ts` orchestration module: calls the provider, persists a `ProductSemanticModel` version, assigns stable `requirementId`s.
6. `semantic-coverage.ts`: deterministic coverage engine (§13).
7. Wire into `generateProductIntelligence`/`generateInitialBlueprint`: Blueprint generation reads the latest semantic model (when present) to derive roles/screens/dataModels/workflows/permissions instead of (or in addition to, unioned with) the bare category list — generic infra (Component Registry, renderer) unchanged.
8. Extend `validateBlueprint` with the semantic-coverage check (§13), extend `runQualityGate` with a coverage-summary check, extend Truth Status with the new fidelity dimensions (§11 of the founder's spec).
9. Fix the Studio UI fact/recommendation labeling (`page.tsx`, one-line label addition — smallest possible fix for the business-intelligence contradiction).
10. Re-run the HomeBase reproduction; confirm materially better, honestly-labeled coverage.
11. Build the 9-fixture regression corpus + novel holdout (Part 12).
12. Full validation suite, real-browser founder verification, independent Level 3 review.

This report is the gate for step 1 onward; per explicit founder instruction, implementation now proceeds automatically.
