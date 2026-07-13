# Pocket Studio Official — Execution State

Human-readable companion to `execution/state.json`. `state.json` is authoritative for machine consumption; this file is authoritative for human review. On any drift between the two, reconcile in favor of repository reality (per Execution Protocol §1 authority order — verified repository state outranks both).

## Current Position

- **Phase 1** — Intelligence, Business Foundation, Trust Architecture, and Premium Experience —
  **COMPLETE**. Level 3 independent phase-exit review accepted the phase (round 2, EV-0047) against
  commit `3739836`, checkpointed as tag `phase-1-complete` (commit `93571b6`). See
  `execution/reviews/level3/phase-1/PHASE_1_COMPLETION_REPORT.md`.
- **Phase 2** — Full-Stack Generation, Editing, Mobile Output, Business Operations, and Verification
  (Master Spec §54-59) — **COMPLETE**. Level 3 independent phase-exit review accepted the phase (round
  2, conditionally accept, condition satisfied immediately — EV-0086), checkpointed as tag
  `phase-2-complete` (commit `dfefbb2`). See
  `execution/reviews/level3/phase-2/PHASE_2_COMPLETION_REPORT.md`. Demonstration product: "Build a
  premium booking app for mobile detailers" (§56).
- **Active implementation unit:** none — Phase 2 complete, awaiting explicit user authorization to
  begin Phase 3.

## Phase 2 Decomposition

Dependency-aware implementation units, each traceable to Master Spec §55 required capabilities and the
§59 exit criteria. Phase 2 extends Phase 1's systems (tenancy, Product State/DNA/Memory/Knowledge,
Orchestration Contract, Decision/Event/Evidence Ledgers, Truth Status, Capability Registry) rather than
recreating them — every unit below reuses the corresponding Phase 1 primitive unless a decision record
says otherwise.

| Unit       | Scope                                                                                                                                                         | Master Spec              | Depends on                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------- |
| P2-01 ✅   | Blueprint Engine — versioned, validated Blueprint model + generator from Product State/DNA/Requirements                                                       | §23                      | Phase 1 Product State, DNA, Knowledge graph |
| P2-02 ✅   | Component Registry — closed set of UI primitives, Zod-validated, unknown-component-fails-safely                                                               | §26                      | —                                           |
| P2-03 ✅   | Build Planner — versioned Build Plan derived from a validated Blueprint                                                                                       | §24                      | P2-01                                       |
| P2-04 ✅   | Generated-app data layer — generic multi-tenant store for a generated product's own data + end users                                                          | §25                      | Phase 1 tenancy                             |
| P2-05 ✅   | Structured Renderer + Interactive Runtime — real, working UI interpreted from Blueprint screens, not hardcoded                                                | §25, §26                 | P2-01, P2-02                                |
| P2-06 ✅   | Full-stack generation orchestration — ties Blueprint+BuildPlan+Registry+data layer+renderer into one generation call                                          | §25                      | P2-01..P2-05                                |
| P2-07 ✅   | Demonstration product — booking app for mobile detailers: concrete Blueprint content, screens, data models, business logic                                    | §56                      | P2-06                                       |
| P2-08 ✅   | Conversational editing + Change Sets + selective regeneration                                                                                                 | §27, §57                 | P2-07, Phase 1 Orchestration Contract       |
| P2-09 ✅   | Version history and restore                                                                                                                                   | §27                      | P2-08                                       |
| P2-10 ✅   | Quality Gate — unit/integration/authorization/tenant/accessibility/e2e tests for the generated product                                                        | §55, §59                 | P2-07                                       |
| P2-11 ✅   | Security/privacy/governance impact + legal/policy draft generation from real state                                                                            | §31, §32, §34            | P2-07, Phase 1 PolicyDocument               |
| P2-12 ✅   | Migration planning for generated-app data model changes                                                                                                       | §28                      | P2-08                                       |
| P2-13 ✅   | Export foundation + durable jobs/retries/checkpoints/idempotency                                                                                              | §25, §29                 | P2-07                                       |
| P2-14 ✅   | Web and PWA output                                                                                                                                            | §39, §40                 | P2-05                                       |
| P2-15 ✅   | Mobile architecture selection + generated mobile project                                                                                                      | §41                      | P2-01, P2-04                                |
| P2-16 ✅   | Mobile-commerce classification + Store Readiness Engine                                                                                                       | §42, §44                 | P2-15                                       |
| P2-17 ✅   | Studio UI wiring — versions/restore, Quality Gate, Store Readiness, mobile project, legal drafts, export                                                      | §6, §7                   | P2-01..P2-16                                |
| P2-EXIT ✅ | Assemble Phase 2 evidence, checkpoint, Level 3 independent review against §59 — round 1 revise → repaired, round 2 conditionally accept → condition satisfied | §16 (Execution Protocol) | all above                                   |

## Phase 2 Completed

- **P2-01 — Blueprint Engine.** New append-only, full-replace versioned `Blueprint` Prisma model
  (migration `20260712094937_blueprint_engine`) covering every Master Spec §23 facet (schema version,
  product type, target users, roles, requirements, workflows, screens, navigation, data models,
  permissions, actions, integrations, business rules, monetization, subscriptions, owner operations,
  output targets, theme/style, assumptions, open decisions, memory, security, privacy, accessibility,
  governance, feasibility, generation metadata). `generateInitialBlueprint()`
  (`src/lib/generation/blueprint-generator.ts`) deterministically derives an initial Blueprint from a
  project's latest Product State, Product DNA, and the Requirements Engine's re-derived Impact Analysis
  categories, using a fixed category → template map (`blueprint-templates.ts`) that reuses P1-06's exact
  category taxonomy rather than inventing new domain concepts — honestly labeled via
  `generationMetadata` as deterministic, never AI-authored design (real AI generation is Phase 3, §61).
  `validateBlueprint()` enforces §23's "Invalid Blueprints may not proceed as successful builds"
  structurally; every Blueprint is persisted with its `validationStatus`/`validationErrors` regardless of
  outcome. Populates SCREEN/WORKFLOW/DATA_MODEL/ACTION Product Knowledge nodes for the first time. 20 new
  tests (9 unit, 11 integration against a real database), full validation suite green (190/190
  unit+integration, clean typecheck/lint/format, production build). See `D-0019`, `EV-0048`, `EV-0049`.
- **Phase 1 regression audit + fix.** In response to an architecture-critique finding, read every page
  in `src/app` for missing implied behavior, misleading affordances, and incomplete interaction states.
  Found one genuine defect: `respondToDecisionAction` had no handling for `DecisionNotPendingError`, so
  answering an already-answered decision (two tabs open on the same pending decision, or a double-click)
  crashed to Next.js's raw error page — the same bug class already fixed once for `createProjectAction`
  (D-0018), reintroduced because this action was added later without the same review. Fixed with a
  graceful `?error=` redirect and the error-banner display the Studio page was missing (every other
  form-bearing page already had one). Every other page/form was verified to already fail gracefully; no
  other defect found in this bounded pass. Forward-committed on top of the accepted Phase 1 checkpoint
  (tag `phase-1-complete`, commit `93571b6`) — does not reopen or modify it. New e2e test
  (`e2e/decision-double-response.spec.ts`) reproduces the scenario deterministically via two tabs sharing
  one session. See `D-0020`, `EV-0050`.
- **Product Pattern and Interaction Contract System.** New reusable Phase 2 capability
  (`src/lib/generation/interaction-contracts.ts`), added in response to the same architecture-critique
  finding: literal requirement/component compliance cannot catch a generated product that is
  structurally present but behaviorally hollow (a list with no empty/error state, a payment step with
  nothing to confirm). Defines a closed vocabulary of interaction states (loading, empty, error, success,
  disabled-while-pending, confirmation, retry) and recognized product patterns (list-view, detail-view,
  form-submission, multi-step-workflow, destructive-action), each mapped to the states it implies.
  `inferScreenPatterns`/`inferWorkflowPatterns` deterministically infer patterns from the same Impact
  Analysis categories the Requirements Engine and Blueprint category templates already use. Wired into
  the Blueprint Engine: every generated screen and workflow now carries a contract (new
  `Blueprint.interactionContracts` column, migration `20260712120533_blueprint_interaction_contracts`),
  and `validateBlueprint` gained a backward-compatible rule enforcing completeness whenever contracts are
  present. `validateInteractionContracts` is exported standalone for the future Quality Gate (P2-10) and
  conversational editing (P2-08) to reuse once real component trees and Change Sets exist. Honest
  limitation: validates that a contract is declared and well-formed, not that an implementation satisfies
  it — no renderer or generation pipeline exists yet (P2-05/P2-06). 15 new tests (13 unit, 2 integration),
  full suite green (205/205 unit+integration excluding concurrently in-progress P2-02 work, 7/7 e2e,
  clean typecheck/lint/format, production build). See `D-0021`, `EV-0051`.
- **Inference Boundaries clarification (AS-0001).** A user clarification defined "practical product
  completeness" precisely: Pocket Studio must reason about the normal supporting behavior a requested
  capability implies (affordances, workflow continuity, state completeness, data lifecycle, validation,
  accessibility, permissions/consequences, product continuity, customer-perceived completeness), not just
  literal requirement/component compliance — while never silently inventing consequential business,
  legal, financial, privacy, security, or publication decisions. Recorded as `D-0022` and durable standard
  `AS-0001` in `execution/state.json`, applying to every downstream P2 unit (P2-02, P2-03, P2-05, P2-06,
  P2-08, P2-10, P2-17). Proportionally extended the Interaction Contract System (not a new system): every
  state a pattern implies is now classified `required` / `conventionally_implied` /
  `consequential_decision`, merged with the stricter classification winning when patterns disagree, and
  every `consequential_decision` state a generated Blueprint implies (e.g. a payment needing confirmation)
  is now surfaced in `Blueprint.openDecisions` — never silently assumed approved. 3 new tests (208/208
  unit+integration excluding concurrently in-progress P2-02 work). **Explicitly not delivered**, and
  recorded as deferred to the units that build the systems they depend on: implied-requirement
  identification in Product Intelligence, explicit-vs-inferred recording throughout the full Blueprint,
  Build Planner conversion of behavior into implementation work, Component Registry behavioral
  capabilities, renderer implementation, workflow-derived generated tests, Quality Gate runtime
  verification, Truth Status reporting of unverified behavior, and the designated "Example App Ideas"
  first vertical proof (that UI pattern does not currently exist in the product). See `D-0022`, `EV-0052`.
- **P2-02 — Component Registry.** New static, code-level module (`src/lib/generation/component-registry.ts`,
  no persistence layer — unlike the Capability Registry, this vocabulary only changes when a developer
  adds a new primitive to the actual renderer). `COMPONENT_TYPES` is the exact, ordered closed set of all
  29 Master Spec §26 primitives (Screen, Stack, Grid, Heading, Text, Image, Icon, Button, Card, List,
  Form, Input, Textarea, Select, Checkbox, Radio, Switch, DatePicker, TimePicker, Badge, Tabs, Modal,
  Drawer, BottomNavigation, TopNavigation, Divider, LoadingState, EmptyState, ErrorState).
  `COMPONENT_CATEGORIES` gives each a structural category (layout/typography/media/action/content/
  form/navigation/state) for the Build Planner to reason with. `ComponentNodeSchema` is a recursive Zod
  schema for a well-formed component tree. `validateComponentTree()` walks an untrusted raw tree and
  replaces any node with an unrecognized `type` with a safe `ErrorState` placeholder plus a
  path-qualified warning, rather than throwing — satisfying §26's literal "unknown components fail
  safely" requirement without failing an entire render over one bad node. Structural validation only, no
  per-component prop contract (deferred to the renderer, P2-05). 15 new unit tests. Full suite green
  (219/219 unit+integration, clean typecheck/lint/format, production build). See `D-0023`, `EV-0053`,
  `EV-0054`.
- **P2-03 — Build Planner.** New append-only, full-replace versioned `BuildPlan` Prisma model
  (migration `20260712124517_build_planner`) covering every Master Spec §24 facet. `generateBuildPlan()`
  (`src/lib/generation/build-planner.ts`) derives every field structurally from a project's latest
  Blueprint and its embedded Feasibility Report: screen order and navigation graph come straight from the
  Blueprint; component structure is built using only Component Registry (P2-02) primitives and run through
  `validateComponentTree` so an unrecognized type fails safely rather than corrupting the plan;
  implementation phases are sequenced (Data layer → Screens & navigation → Workflows & business logic →
  Integrations & monetization → Testing & evidence, each gated on whether the Blueprint actually has that
  content) with a `dependencies` map chaining each phase to its immediate predecessor; `tests` are derived
  directly from each screen's Interaction Contract required states (P2-01's Product Pattern system).
  `planStatus` is `BLOCKED` — never silently `READY` — whenever the Blueprint is `INVALID`, requests a
  capability the Supported Capability Registry doesn't recognize or rates
  NOT_CURRENTLY_SUPPORTED/UNSAFE_OR_PROHIBITED/INSUFFICIENT_INFORMATION/PROFESSIONAL_REVIEW_REQUIRED/
  EXTERNAL_APPROVAL_REQUIRED, or has an unresolved consequential interaction decision. A capability merely
  rated `SUPPORTED_LATER_PHASE` (e.g. Pocket Studio's own full-stack generation pipeline, which doesn't
  exist until P2-06) is deliberately _not_ a plan-level blocker — see `D-0024` for why. Exported
  `CHECKOUT_SCREEN_NAME`/`LIST_LIKE_SCREEN_NAMES` from `interaction-contracts.ts` (backward-compatible) so
  the Build Planner reuses the same screen-name conventions instead of duplicating them. 11 new integration
  tests against a real database. Full suite green (230/230 unit+integration, clean typecheck/lint/format,
  production build). See `D-0024`, `EV-0055`, `EV-0056`.
- **P2-04 — Generated-app data layer.** Two new mutable, project-scoped Prisma models (migration
  `20260712125631_generated_app_data_layer`) rather than dynamically generated per-customer Postgres
  schema/migrations (which would conflict with Master Spec §28's migration-safety requirements applied to
  infrastructure Pocket Studio itself would be generating unsupervised). `GeneratedAppUser`
  (`src/lib/generation/generated-app-users.ts`) is a generated product's own end-user identity — e.g. the
  person booking a detailing appointment — distinct from Pocket Studio's platform `User`/`Membership`,
  project-scoped email uniqueness (two unrelated generated products may share an end user's email without
  conflict), reusing the platform's existing scrypt password hashing and 8-character minimum-length policy
  rather than a second implementation. `GeneratedRecord` (`generated-records.ts`) is a generic
  `{projectId, modelKey, data}` store; `modelKey` and required fields are validated at write time against
  the project's current Blueprint `dataModels`, so a record can never silently reference a data model the
  Blueprint doesn't define. Both models cascade-delete from `Project`, so `test/reset-db.ts` needed no
  change. 16 new integration tests against a real database, including cross-project isolation. Full suite
  green (246/246 unit+integration, clean typecheck/lint/format, production build). Honest limitation: no
  end-user-facing session/login flow exists yet — only the Pocket-Studio-side project member can read/write
  this data today; real end-user authentication for a generated product is P2-06 scope. See `D-0025`,
  `EV-0057`, `EV-0058`.
- **P2-05 — Structured Renderer + Interactive Runtime.** Three separated pieces, mirroring the same
  layering used for Blueprint/Build Plan generation. `src/components/renderer/component-renderer.tsx`
  (Client Component) recursively renders a validated `ComponentNode` tree into real, interactive DOM
  using only Component Registry (P2-02) primitives — Button clicks fire a real callback, Form submission
  uses React's native `<form action={fn}>` (the same pattern every Server-Action-backed form in this
  codebase already uses, e.g. `src/app/sign-up/page.tsx`), Tabs/Modal/Drawer hold real local
  open/active state. `src/lib/generation/screen-data-binding.ts` is a pure, DOM-free function that swaps
  a screen's `List` node for real record data or a matching `LoadingState`/`EmptyState`/`ErrorState`
  node given a `ScreenDataState` — never silently rendering an empty list when data hasn't loaded.
  `src/lib/generation/render-runtime.ts` is the server-only read/write binding to the P2-04
  generated-app data layer, keyed off the current Build Plan's `dataDependencies` (P2-03). Also fixed a
  real, previously-latent bug: added a global `afterEach(cleanup)` to `vitest.setup.ts`, since
  `@testing-library/react`'s own auto-cleanup never registers without `test.globals: true` (which this
  project deliberately does not set) — the first `.tsx` test file in the repo surfaced a cross-test DOM
  leak this fixes for every future component test, not just this unit's. 22 new tests (9 Testing
  Library/jsdom, 7 pure unit, 6 integration against a real database). Full suite green (268/268
  unit+integration, 7/7 e2e re-verified after the shared setup change, clean typecheck/lint/format,
  production build). Honest limitation: not wired into a live, customer-facing route yet — that
  orchestration is P2-06. See `D-0026`, `EV-0059`, `EV-0060`.
- **P2-06 — Full-stack generation orchestration.** `generateApplication()`
  (`src/lib/generation/generation-orchestrator.ts`) is the single generation call: regenerates a fresh
  Blueprint, plans a Build Plan from it, and syncs Truth Status for `generation.full_stack_web_app` to
  _this project's_ real `GENERATED`/`BLOCKED` outcome — a per-project fact, distinct from the
  platform-wide roadmap claim that a generation pipeline exists at all. A new live route,
  `/org/[orgSlug]/[projectSlug]/preview/[screen]`, gated by the same platform session/tenant checks as
  every other Studio page, loads the current Build Plan's `componentStructure` for a screen, binds real
  data via `loadScreenData`+`bindScreenData` (P2-05), and renders it with `ComponentRenderer`, with Form
  submission wired to a real Server Action (`submitGeneratedRecordAction`, using Next.js's bound-arguments
  pattern to carry `orgSlug`/`projectSlug`/`screenName`). `authenticateGeneratedAppUser`
  (`generated-app-auth.ts`) verifies real credentials for a generated product's own end user — no
  session/cookie of its own yet. The Studio page's placeholder Preview section is now a real
  "Generate app"/"Regenerate" action plus real per-screen Preview links reflecting the actual Build
  Plan. Also fixed a real gap: `submitGeneratedRecordAction` now gracefully handles
  `InvalidRecordDataError`/`UnknownDataModelError` — a Build Plan's placeholder Form doesn't yet name its
  Input after a data model's real required fields, so a genuine submission through the DOM will
  legitimately fail today, and it must fail gracefully (redirect with an honest message), the same
  discipline already established for `createProjectAction` (D-0018). 17 new tests (11 integration against
  a real database, 1 new e2e test driving Generate → Preview → a real data-bound `EmptyState` through an
  actual browser). Full suite green (279/279 unit+integration, 8/8 e2e, clean typecheck/lint/format,
  production build — new route confirmed in build output). Honest limitations: the live preview requires
  the existing platform session, not a separate customer-facing route; the Form/data-model field mismatch
  means a real write through the DOM isn't provable yet, only the read/list-binding path. See `D-0027`,
  `EV-0061`, `EV-0062`.
- **P2-07 — Demonstration product (Master Spec §56).** Two parts. First, a generic (not idea-specific)
  fix to the Build Planner: a screen's `Form` now names its `Input` elements after the bound data
  model's real fields (excluding system-managed `id`/`createdAt`) instead of one anonymous `Input` —
  closes the placeholder-Form gap disclosed as a known limitation of P2-06, benefiting every product's
  generated forms. Second, `official-demonstration.integration.test.ts` and
  `e2e/official-demonstration.spec.ts` run Master Spec §54's exact required sentence — `"Build a premium
booking app for mobile detailers."` — through the full pipeline end to end, live in a real browser,
  and honestly assert what the deterministic pipeline actually produces today: a `VALID` Blueprint,
  `READY` Build Plan, `GENERATED` status, with only the base recommended screens (`Home`, `Browse`) and
  **zero** data models. This falls well short of §56's full vision (11 customer screens, 11 owner
  screens, 11 data types — Services, Packages, Availability, Memberships, etc.), and that gap is
  deliberately **not** closed by hardcoding this one sentence's content — doing so would violate
  §26's "not hardcoded preview screens" requirement and the "never overstate" constraint governing this
  entire build. Closing it honestly requires either a deliberately expanded, reusable domain-template
  vocabulary or real AI-backed generation (Phase 3, §61); recorded as an explicit, disclosed limitation,
  not silently implied to be complete. 4 new integration tests (1 regression for the Input-naming fix +
  3 for the official demonstration), 1 new e2e test. Full suite green (283/283 unit+integration, 9/9
  e2e, clean typecheck/lint/format, production build). See `D-0028`, `EV-0063`, `EV-0064`.
- **P2-08 — Conversational editing, Change Sets, selective regeneration (Master Spec §27, §57).**
  New `ChangeSet` Prisma model (1:1 with its governing `Decision`, migration `20260712143138_change_sets`)
  plus `src/lib/orchestration/change-set.ts`. Every `edit_request` intent (`beginChangeFlow`) now
  generates a structured Change Set alongside its Decision: `combinedIdea` always appends the edit to
  the prior idea text rather than replacing it (never discarding what was already said), and
  `addedCategories` is computed by diffing `deriveRequirements(priorIdea)` against
  `deriveRequirements(combinedIdea)` — the categories genuinely new to this edit. "Selective
  regeneration" means exactly that: `generateProductIntelligence` + `generateApplication`
  (P1-06/P2-06) only run when `addedCategories` is non-empty; an edit with no new structural signal is
  honestly recorded `APPLIED` with no new Blueprint/Build Plan version, not a no-op version. A
  ROUTINE/IMPORTANT edit's Change Set applies immediately; a CONSEQUENTIAL edit's stays `PENDING` until
  approved, via a new `respondToChangeSetDecision` wrapper (now used by `respondToDecisionAction`) that
  only drives apply/reject for decisions with a linked Change Set — a plain decision (e.g. from
  `describe_idea`) behaves exactly as before.

  Building this live (not just with unit tests) surfaced a real regression, fixed in the same unit:
  `generateProductIntelligence`'s `ProductState` is full-replace, and calling it a second time from an
  applied Change Set silently reset a customer's already-edited `unitEconomicsAssumptions` back to
  defaults — Phase 1 never exercised a second call to that function, so this never surfaced before.
  `golden-path.spec.ts` caught it live in a real browser. Fixed by carrying `unitEconomicsAssumptions`
  forward from the latest existing Product State unless there is none yet, the same "must not silently
  erase" principle already applied to Product DNA (D-0006), now correctly extended to the one
  Product-State field a customer can directly edit. 12 new integration tests (5 in
  `change-flow.integration.test.ts`, 6 in `change-set.integration.test.ts`, 1 regression test in
  `product-intelligence.integration.test.ts`). Full suite green (295/295 unit+integration, 9/9 e2e
  including the test that caught the regression, clean typecheck/lint/format, production build).
  Honest limitation: "selective regeneration" is category-level, not screen/field-level; version
  history and restore (§27's other half) is P2-09, not delivered here. See `D-0029`, `EV-0065`,
  `EV-0066`.

- **P2-09 — Version history and restore (Master Spec §27's other half).** `getProjectVersionHistory`
  (`src/lib/orchestration/version-history.ts`) assembles Product State, Blueprint, Build Plan, and
  Change Set rows — each already append-only versioned, so every entry is an immutable version
  identifier by construction — into one chronological, newest-first timeline, rather than inventing a
  new unified version-numbering scheme spanning four independently-evolving tables.
  `previewBlueprintRestore` computes a real screens/dataModels diff between a target Blueprint version
  and the current latest. `validateBlueprintRestore` re-runs the exact same structural
  `validateBlueprint` check every newly generated Blueprint passes through, against the target
  version's stored content, before anything is restored. `restoreBlueprintVersion` creates a new top
  Blueprint version whose content equals the target's, never mutating or deleting the versions in
  between — the same append-only discipline used everywhere else in this codebase. Restore is scoped
  to Blueprint only: Build Plan is cheaply regenerable on demand from a Blueprint (P2-03), and Product
  State restore has no established customer-facing entry point yet. 10 new integration tests against a
  real database. Full suite green (305/305 unit+integration, 9/9 e2e, clean typecheck/lint/format,
  production build). Honest limitation: no Studio UI surface yet for browsing history or triggering a
  restore (P2-17). See `D-0030`, `EV-0067`, `EV-0068`.
- **P2-10 — Quality Gate for the generated product (Master Spec §55, §59).** `runQualityGate()`
  (`src/lib/generation/quality-gate.ts`) runs 8 real checks against a project's current Blueprint and
  Build Plan: Blueprint structurally valid; Build Plan has no unresolved blockers; every screen has a
  well-formed Interaction Contract (reusing P2-01's own `validateInteractionContracts`); list-view
  screens actually contain a `List` node and have a real data dependency configured (the structural
  precondition for P2-05's runtime Loading/Empty/Error binding to work — that binding only exists at
  render time, never in the static Build Plan tree); form-submission screens' Input names match their
  bound data model's real fields (turning the P2-06/P2-07 disclosed placeholder-Form gap into an
  ongoing, re-checkable gate, not just a one-time fix); every screen reachable from the navigation
  graph; every Image has alt text (the accessibility dimension); and a real server-side smoke check
  that every screen's data binding resolves without throwing (the end-to-end dimension, honestly
  scoped — no per-generation browser run, no live authorization/tenant fuzzing, since tenant isolation
  is structurally guaranteed by the generated-app data layer's own query scoping, P2-04). Every run
  records real Product Evidence (new `QUALITY_GATE_CHECK` type) and syncs Truth Status for a new
  `quality.gate` subject key — never a self-report. 5 new integration tests, including a deliberately
  corrupted Build Plan proving the form-field check independently catches the exact defect class the
  P2-07 fix already prevents at generation time. Full suite green (310/310 unit+integration, 9/9 e2e,
  clean typecheck/lint/format, production build). See `D-0031`, `EV-0069`, `EV-0070`.
- **P2-11 — Security/privacy/governance impact + legal draft generation (Master Spec §31, §32,
  §34).** Closes a gap Phase 1 (P1-08) deliberately left open: `GovernanceProfile`/`PolicyDocument` had
  durable, versioned storage but no real content derivation. `src/lib/orchestration/governance-and-legal.ts`:
  `deriveGovernanceProfile`/`syncGovernanceProfile` derive `dataCategories`, `monetizationModel`, and
  `relevantGovernanceDomains` entirely from a project's real Blueprint content — facts no Blueprint
  content can imply (business/user locations, product category, user age range, distribution channels)
  are deliberately left unset rather than guessed. `deriveSecurityPrivacyRequirements`/
  `recordSecurityPrivacyGovernanceAssessment` derive a narrowed (not the full §31 list verbatim) set of
  security/privacy requirements grounded in what the Blueprint actually contains, recorded as a ROUTINE
  Decision reusing the existing Product-facing Decision Ledger rather than new schema.
  `generatePolicyDraft` generates real Terms of Service/Privacy Policy/AI Disclosure content from actual
  Blueprint/Product DNA state; facts §34 explicitly forbids inventing (company identity, jurisdiction,
  contact details) are bracketed placeholders in the content itself plus a recorded Product Memory
  `OPEN_QUESTION` — never fabricated — and every draft carries an explicit not-legal-advice/
  requires-professional-review notice. 11 new integration tests. Full suite green (321/321
  unit+integration, 9/9 e2e, clean typecheck/lint/format, production build). Honest limitation: only 3
  of 13 `PolicyDocumentType` values have a real content generator; no professional-review/publication
  workflow exists yet. See `D-0032`, `EV-0071`, `EV-0072`.
- **P2-12 — Migration planning for generated-app data model changes (Master Spec §28).**
  `src/lib/generation/migration-planning.ts`, scoped to a generated product's own data models
  (Blueprint `dataModels` / P2-04's `GeneratedRecord` store), not this platform's own Postgres schema
  (already migrated through Prisma). `planDataModelMigration(fromVersion, toVersion)` performs the full
  §28 sequence: schema diff (`diffDataModels`, a pure function classifying each data model as
  added/removed/changed/unchanged with field-level detail); a real data-loss analysis that queries
  actual `GeneratedRecord` rows for each removed field rather than guessing structurally; compatibility
  notes for added fields (existing records will need them backfilled on next update); an ordered
  migration plan; and an honest backup requirement (no automated backup mechanism exists yet —
  disclosed, not glossed over) and rollback plan (referencing P2-09's append-only
  `restoreBlueprintVersion`). Never mutates any `GeneratedRecord` row — Preview only.
  `recordMigrationPlanDecision` records the plan as CONSEQUENTIAL when destructive or ROUTINE
  otherwise, reusing the existing Decision Ledger rather than a new one-off approval gate. 12 new tests
  (4 pure unit, 8 integration against a real database, including a genuine data-loss scenario built by
  creating a real record then a Blueprint version that drops the field it uses). Full suite green
  (333/333 unit+integration, 9/9 e2e, clean typecheck/lint/format, production build). Honest
  limitation: not wired into `applyChangeSet`'s auto-apply path — a destructive Change Set still
  regenerates automatically today; no backup mechanism exists (deferred to P2-13). See `D-0033`,
  `EV-0073`, `EV-0074`.
- **P2-13 — Export foundation + durable jobs (Master Spec §25, §29).** `exportProject()`
  (`src/lib/generation/export.ts`) bundles Product State/DNA, the latest Blueprint/Build Plan, every
  `GeneratedRecord`, generated-app users (allowlisted fields only — id/email/name/role/createdAt, never
  `passwordHash`), policy drafts, the Governance Profile, and Truth Status into one structured JSON
  bundle, with explicit disclosures that it is not a deployable code package or a database backup and
  never includes any credential material. A new `JobRun` model (`src/lib/generation/job-runs.ts`;
  PENDING/RUNNING/SUCCEEDED/FAILED, `checkpoint`, `idempotencyKey`, `attempt`) wraps — never modifies —
  `generateApplication` (P2-06) via `runGenerationJob`: idempotent (a repeated call with the same key
  returns the existing job without regenerating once it has succeeded), retryable (a FAILED job called
  again with the same key increments `attempt` and genuinely retries), and gives every generation call
  real, queryable status for the first time. Checkpointing is coarse-grained — before/after the whole
  `generateApplication` call, not its internal sub-steps — an honest, disclosed limitation. 14 new
  integration tests, including a genuine failure captured by omitting Product State (not a mock), a real
  retry-after-failure, and confirmation that no serialized export ever contains `passwordHash`. Full
  suite green (347/347 unit+integration, 9/9 e2e, clean typecheck/lint/format, production build). See
  `D-0034`, `EV-0075`, `EV-0076`.
- **P2-14 — Web and PWA output (Master Spec §39, §40).** `syncOutputTargetStatus()`
  (`src/lib/generation/pwa.ts`) tracks `output.web`/`output.pwa`/`output.ios`/`output.android`
  independently via the existing Truth Status mechanism — §39's much richer 14-value status vocabulary
  (requested/generated/tested/built/signed/uploaded/submitted/approved/released/...) lives in each
  entry's free-text rationale rather than a new schema/enum this codebase cannot yet populate
  meaningfully — wired into `generateApplication` (P2-06) as one additional sync call, not a structural
  change. A real, per-project Web App Manifest (`generateManifest()`, deriving name/short_name/
  start_url/scope from actual Project/Product DNA data, referencing the platform's own existing
  favicon rather than fabricating icons) is served at `/org/[orgSlug]/[projectSlug]/manifest.webmanifest`,
  and a real minimal service worker (activates immediately, passes every fetch straight through — no
  offline caching claimed) at `.../sw.js`; both wired into the live preview page and verified to
  genuinely register in a real browser. 8 new unit/integration tests, 1 new e2e test. Full suite green
  (355/355 unit+integration, 10/10 e2e, clean typecheck/lint/format, production build). Honest
  limitation: no Lighthouse-grade installability audit, no offline/push architecture, no Studio UI
  explaining web vs. PWA vs. native mobile yet (P2-17). See `D-0035`, `EV-0077`, `EV-0078`.
- **P2-15 — Mobile architecture + generated mobile project (Master Spec §41).** React Native +
  Expo selected and documented (Master Spec's own suggested example) via a `MOBILE_ARCHITECTURE`
  constant and `generationMetadata` rather than a Decision Ledger entry, since the choice is a fixed
  platform constant, not a customer-specific recommendation. `generateMobileProjectFiles()`
  (`src/lib/generation/mobile.ts`) deterministically produces a real, minimal Expo project scaffold
  (`app.json`/`package.json`/`tsconfig.json`/`App.tsx`) from the project's actual name and Blueprint
  screen list — a static navigation-list scaffold, not a feature-complete mobile app; no mobile
  equivalent of the web Structured Renderer/Interactive Runtime (P2-05) exists yet.
  `validateMobileProjectFiles()` performs real "build validation" honestly scoped to JSON parsing plus
  TypeScript/TSX syntax validation via the TypeScript compiler's own parser — genuinely catches
  malformed generated code, verified with a standalone script before relying on it in tests — but is
  explicitly not a full type-check against React Native's ambient types (not installed in this repo)
  and never a real native `.ipa`/`.apk` build (no Xcode/Android SDK in this environment).
  `generateMobileProject()` syncs `output.ios`/`output.android` Truth Status to `IMPLEMENTED` with an
  honest no-native-build rationale. 10 new tests (6 pure unit, 4 integration against a real database).
  Full suite green (365/365 unit+integration, 10/10 e2e, clean typecheck/lint/format, production
  build). Honest limitation: `output.ios`/`output.android` is not coupled to `generateApplication` — a
  later web regeneration resets both to `NOT_EVALUATED` until this function is called again. See
  `D-0036`, `EV-0079`, `EV-0080`.
- **P2-16 — Mobile-commerce classification + Store Readiness Engine (Master Spec §42, §44).**
  `classifyMobileCommerce()` (`src/lib/generation/store-readiness.ts`) deterministically derives §42's
  transaction category (physical goods/services, digital goods/content/subscriptions, app
  functionality, donations, marketplaces, regulated products, external account access) from a
  project's real original idea text via the same word-boundary keyword-matching discipline already
  established in `impact-analysis.ts` (P1-04) — not from `Blueprint.monetization`'s own text, which is
  a fixed template string with no distinguishing signal between transaction types. An idea with
  monetization present but no matching keyword is honestly reported `unclassified` rather than guessed
  into the nearest category. `assessStoreReadiness()` mirrors the Quality Gate's pattern (P2-10): real
  checks against real project state (mobile project generated/validated, mobile-commerce
  classification resolved, Terms of Service drafted, Privacy Policy drafted, developer account
  connected), recording Evidence and syncing a new `store.readiness` Truth Status subject key.
  `readinessStatus` is a fixed, honest `NOT_READY` — no Apple/Google developer account integration
  exists in this build (Phase 3 scope, §61/§65), and §44 separately requires explicit customer
  approval before any real submission regardless. 12 new tests (6 pure unit, 6 integration against a
  real database). Full suite green (377/377 unit+integration, 10/10 e2e, clean typecheck/lint/format,
  production build). See `D-0037`, `EV-0081`, `EV-0082`.
- **P2-17 — Studio UI wiring for Phase 2 (Master Spec §6 Simple Mode surfaces).** Closed the
  repeatedly-disclosed "no Studio UI surface yet" gap for the highest-value Phase 2 capabilities: a
  new Versions section on the Studio page lists `getProjectVersionHistory`'s real chronological
  timeline (P2-09) with a real one-click Blueprint restore button per past version; the Launch section
  gained real buttons wired directly to already-tested service functions — Run Quality Gate (P2-10),
  Assess store readiness (P2-16), Generate mobile project (P2-15), and per-type legal draft generation
  (P2-11: Terms of Service/Privacy Policy/AI Disclosure, relabeling Generate→Regenerate once a draft
  exists); a new authenticated `GET .../export` route streams the real P2-13 export bundle as a
  downloadable JSON file, mirroring the `manifest.webmanifest`/`sw.js` route pattern from P2-14. The
  single highest-leverage change: the existing generic Trust section (already rendering every Truth
  Status `subjectLabel` + badge) now also renders each entry's real `rationale` text — since every
  P2-10/P2-14/P2-15/P2-16 function already writes a detailed, honest rationale to Truth Status, this
  one change made all of their real results visible in the UI for the first time without inventing any
  new state or plumbing. No new unit/integration tests were needed (every underlying function already
  has its own coverage); instead added a new end-to-end browser test
  (`e2e/launch-actions.spec.ts`) driving every new action through the real Studio UI, proving the
  wiring itself works, not just the underlying functions. Full suite green (377/377 unit+integration
  unchanged, 11/11 e2e — 10 pre-existing + 1 new, clean typecheck/lint/format, production build).
  Honest limitation: no dedicated "Operate" surface (§6's sixth Simple Mode tab — product health, live
  business activity, alerts — describes production monitoring systems that don't exist yet, Phase 3
  scope); restore has no diff-preview step in the UI; migration planning (P2-12) still has no UI
  surface at all. See `D-0038`, `EV-0083`.
- **P2-EXIT round 1 review and repair.** An independent, fresh-context Level 3 reviewer (Review
  Protocol §2) audited Phase 2 against commit `605e62d` and returned verdict **revise**
  (`execution/reviews/level3/phase-2/ROUND_1_REVIEW.md`), citing two CRITICAL DEFECTs it live-reproduced
  against a real running instance: (1) a version-creation race — `createBlueprintVersion`/
  `createProductStateVersion`'s read-latest-then-create-next-version pattern is not serialized under
  Postgres's default READ COMMITTED isolation, so a double-clicked "Generate app" could crash to a raw
  Prisma `P2002` error instead of the graceful `?error=` redirect this codebase requires everywhere
  else; (2) every Server Action crashed to a raw error page on an expired/absent session instead of
  redirecting to sign-in, since no action caught `UnauthenticatedError` (the two P2-14 Route Handlers
  already did this correctly). Plus two DEFECTs: the §56 demonstration-product content gap needed an
  explicit phase-exit-level acknowledgment rather than D-0028's routine self-classification; `sw.js` was
  missing the same auth/tenant gate its sibling `manifest.webmanifest` route has. All four were fixed
  (`D-0040`, `EV-0085`): `src/lib/db-versioning.ts`'s `createNextVersion()` adds a shared
  retry-with-jittered-backoff wrapper, applied to all 8 append-only versioned models that share the
  racy pattern (not just the two reproduced); `requireCurrentUserForAction()`
  (`src/lib/web/require-user.ts`) replaces `requireCurrentUser()` across all 6 Server Action files;
  `D-0039` records the explicit §56/§59 acknowledgment; `sw.js` now carries the same gate as
  `manifest.webmanifest`. Both critical fixes were adversarially self-verified before being trusted:
  each was reverted, confirmed a new regression test reproduces the reviewer's exact live failure (a
  10-concurrent-writer integration test genuinely hits `P2002` without the fix;
  `e2e/auth-guard.spec.ts`'s new expired-session test genuinely crashes without the fix), then restored
  and reconfirmed green. Full suite green (382/382 unit+integration — 377 prior + 5 new, 12/12 e2e — 11
  prior + 1 new, clean typecheck/lint/format, production build). Next: round 2 independent review.
- **P2-EXIT round 2 review and repair.** A second independent, fresh-context Level 3 reviewer audited
  Phase 2 against commit `6a6e393` and returned verdict **conditionally accept**
  (`execution/reviews/level3/phase-2/ROUND_2_REVIEW.md`). It independently re-verified all four round 1
  fixes live rather than trusting the repair summary — reverting each in turn and confirming the exact
  failure reproduces, then restoring and reconfirming — and stress-tested the concurrency fix well
  beyond the team's own evidence (100 concurrent writers, no failure). Its own adversarial pass beyond
  the round 1 findings surfaced one new, undisclosed instance of the identical race class:
  `startOrGetJobRun` (`src/lib/generation/job-runs.ts`) could crash with an uncaught Prisma `P2002` when
  two concurrent callers shared the same `idempotencyKey` — not a CRITICAL DEFECT (the affected code is
  not wired into any live Server Action or route today), but the reviewer's condition for acceptance
  required it be fixed or disclosed, explicitly noting that satisfying the condition would not require
  another full review cycle. Fixed immediately rather than only disclosed: `startOrGetJobRun` now
  catches the exact conflict and defers to the winner's row via a new `resolveExistingJobRun` helper —
  the correct idempotency response, distinct from `createNextVersion`'s retry-a-new-version pattern
  (which doesn't apply here, since a `JobRun`'s identity is fixed by its `idempotencyKey`, not an
  incrementing version number). Adversarially self-verified the same way as every prior fix: reverted,
  confirmed a new 10-concurrent-caller regression test reproduces the exact live crash, restored,
  reconfirmed green. Full suite green (383/383 unit+integration — 382 prior + 1 new, 12/12 e2e, clean
  typecheck/lint/format, production build). See `D-0041`, `EV-0086`.
  **Phase 2 exit is achieved as of commit `5fbb869`, checkpointed as tag `phase-2-complete`.** See
  `execution/reviews/level3/phase-2/PHASE_2_COMPLETION_REPORT.md`.

## Completed

- Governance baseline committed (`25a33f0`): Master Spec, Execution Protocol, Review Protocol v1.0, all in `docs/`.
- Completeness Check (Execution Protocol §2) passed — see `EV-0001` in the Evidence Ledger.
- Durable execution state initialized (this directory).
- **P1-01 — Repo/app foundation.** Next.js 16.2.10 App Router + React 19.2.4, strict TypeScript
  (`noUncheckedIndexedAccess`, `noImplicitOverride`, etc.), Tailwind 4, ESLint (eslint-config-next),
  Prettier (+ tailwindcss plugin, `docs/` excluded — see D-0003), Vitest + Testing Library, Playwright
  scaffolding, Prisma 7 with the new driver-adapter architecture (`@prisma/adapter-pg` + `pg`,
  `prisma.config.ts`) against a local Postgres run via `docker-compose.yml`, server-only env validation
  (`src/lib/env.ts`, zod), and a `/api/health` route proving real DB connectivity. Full validation suite
  (typecheck, lint, format check, unit tests, production build, manual runtime smoke test) passes —
  see `EV-0002`..`EV-0006`. Next.js 16 / Prisma 7 breaking changes vs. older conventions documented in
  `D-0002`.
- **P1-02 — Data layer.** Prisma schema + first migration (`20260711133038_init_identity_and_tenancy`)
  for User, Session, Organization, Membership (role enum: OWNER/ADMIN/MEMBER), Project — applied to both
  the dev database and a dedicated `pocket_studio_test` database (see `docker/postgres-init/`). Password
  hashing via Node's built-in scrypt (`D-0004`, no new native-binding dependency). Opaque, hashed session
  tokens in httpOnly cookies. The tenant-isolation choke point (`src/lib/tenancy/authz.ts`:
  `requireOrganizationMembership` / `requireProjectAccess`) resolves a project's _actual_ owning
  organization before checking membership — a caller-supplied organizationId is never trusted directly.
  17 integration tests run against the real test database (not mocks) prove: same-tenant access works,
  cross-tenant organization and project access is denied, project creation is denied for non-members (and
  verified no row is created), minimum-role enforcement works, and a nonexistent project id fails closed
  without leaking existence. Caught and fixed a real cross-file test-parallelism race where three
  integration test files sharing one Postgres database stomped on each other's fixtures (`D-0005`).
  Evidence: `EV-0007`..`EV-0012`.
- **P1-03 — Canonical Product State, Product DNA, Product Memory, Product Knowledge relationships.**
  Migration `20260711135504_product_state_dna_memory_knowledge`. `ProductState` and `ProductDNA` are
  append-only/versioned (each write creates a new row; "current" is the latest version, prior versions
  stay inspectable). `ProductDNA` partial updates merge onto the previous version instead of replacing it
  — omitting a key carries the old value forward, passing `null` explicitly clears it — implementing
  Master Spec §10's "edits must not silently erase Product DNA." `ProductMemoryEntry` is discrete, typed,
  appendable entries (not one blob), matching §11's rejection of "unbounded chat history" as the sole
  memory architecture. `ProductKnowledgeNode`/`ProductKnowledgeEdge` form a generic typed graph with
  stable cuid ids for the §12 Requirement→Workflow→Screen→...→Evidence chain; edges are rejected across
  projects and self-loops are rejected. Caught and fixed a real bug during implementation: Prisma's
  generated create input rejects a literal `null` for nullable Json columns (needs the `Prisma.JsonNull`
  sentinel), and an early test conflated "key omitted" with "key present but `undefined`" — both
  distinct states in JS but not distinguishable the way the code first assumed. Fixed at the type level
  so the public contract only recognizes two states (`D-0006`). 28 integration tests across the four
  models. Evidence: `EV-0013`..`EV-0015`.
- **P1-04 — Orchestration Contract, Intent Resolver, Impact Analysis foundation, Decision Ledger.**
  AI provider abstraction (`src/lib/ai/`): one interface, `MockAIProvider` fully implemented
  (deterministic, no external calls — `summary` echoes input rather than paraphrasing it, so it never
  misrepresents itself as real understanding), `AnthropicAIProvider` stubbed to throw
  `ProviderNotImplementedError` since real provider connections are Phase 3 scope (Master Spec §61,
  `D-0007`). Intent Resolver classifies a submission as `describe_idea` vs. `edit_request` by checking
  for existing Product State. Impact Analysis (`src/lib/orchestration/impact-analysis.ts`) is a
  deterministic keyword categorizer against the Master Spec §14 impact categories, flagging
  monetization/security/privacy/governance as consequential per §4.2. Product-facing Decision Ledger
  (`Decision` model, distinct from this file's build-process ledger) implements §15 disclosure tiers:
  ROUTINE auto-applies, IMPORTANT is recommended-but-not-applied, CONSEQUENTIAL holds
  `PENDING_APPROVAL` until an explicit approve/reject response. `beginChangeFlow` wires intent
  resolution → impact analysis → decision recording into the early stages of the §13 Orchestration
  Contract flow. Caught and fixed a real bug during implementation: plain substring matching flagged
  "Build a premium booking app" as touching "screens" because "build" contains "ui" (the screens
  keyword). Fixing this by requiring both-edge word boundaries then broke matching on ordinary plurals
  like "deposits". Settled on left-boundary-only matching (`D-0008`), with regression tests for both
  failure modes. 33 new tests (68 total in the suite). Evidence: `EV-0016`..`EV-0019`.
- **P1-05 — Capability and Feasibility Engine, Supported Capability Registry.** Platform-wide (not
  tenant-scoped — this is Pocket Studio's own policy, not customer data), append-only versioned per
  `capabilityKey`, migration `20260711142316_capability_registry`. The `implementationLevel` enum
  mirrors Master Spec §4.3's classification exactly. Seed data (`src/lib/registry/seed-data.ts`) is
  deliberately truthful: only `auth.email_password` and `tenancy.organizations_and_projects` are
  `SUPPORTED_NOW`; generation, payments, mobile, live AI, governance drafts, store distribution, and
  Pocket Studio's own billing are all `SUPPORTED_LATER_PHASE` or `EXTERNAL_APPROVAL_REQUIRED`, each
  citing the specific Master Spec section that defers it (`D-0009`) — the registry never overstates
  what exists today. `assessFeasibility` looks capability keys up against the registry and reports
  unrecognized keys explicitly rather than assuming support. 13 new tests (81 total). Evidence:
  `EV-0020`..`EV-0022`.
- **P1-06 — Product Intelligence, Requirements Engine, Business Model Brief, unit economics.**
  `deriveRequirements` reuses Impact Analysis's categories as its signal source (one taxonomy, not two)
  to produce EXPLICIT/INFERRED/RECOMMENDED requirement statements; `extractTargetCustomer` does
  best-effort "... for &lt;audience&gt;" pattern matching, honestly labeled as not real language
  understanding. `suggestCapabilityKeys` only ever emits keys that exist in the seed-data registry —
  never invents a plausible-sounding one, so Feasibility can catch drift. `deriveBusinessModelBrief` and
  `deriveMonetizationRecommendations` (Master Spec §19) default toward simplicity and never assume a
  price. `defaultUnitEconomicsAssumptions` (§20) labels every field's source (`unknown` / `estimate`;
  never `provider_reported` or `actual_connected` in Phase 1). `generateProductIntelligence` wires all
  of it together: derives everything, calls `assessFeasibility` (P1-05) for a real Feasibility Report,
  then persists a new Canonical Product State version, a new Product DNA version, one Requirement
  knowledge node per derived requirement, a FACT memory entry for the original idea, and an
  OPEN_QUESTION memory entry per real gap. Wired into `beginChangeFlow` for `describe_idea` intents only
  — Phase 1's own customer flow (§51) never requires an edit, so `edit_request` handling stays at the
  disclosure/approval level until Phase 2's conversational editing (§55, §57) (`D-0010`). 25 new tests
  (107 total). Evidence: `EV-0023`..`EV-0025`.
- **P1-07 — Event Ledger, Evidence Ledger, Truth Status (product-facing).** `ProductEvent` is an
  append-only audit trail; `ProductEvidence` backs every claim with a verifiable record; `TruthStatusEntry`
  is versioned per `(projectId, subjectKey)`, same latest-wins pattern as the other append-only models.
  `syncTruthStatusFromFeasibility` maps a capability's _platform_ `implementationLevel` to a conservative
  _per-project_ status: `SUPPORTED_NOW → IMPLEMENTED`, every `SUPPORTED_WITH_*`/`SUPPORTED_LATER_PHASE`/
  `PROTOTYPE_ONLY`/`PLANNING_ONLY → PLANNED`, `EXTERNAL_APPROVAL_REQUIRED`/`PROFESSIONAL_REVIEW_REQUIRED
→ BLOCKED`, `NOT_CURRENTLY_SUPPORTED`/`UNSAFE_OR_PROHIBITED → UNSUPPORTED`, and no registry entry
  (or `INSUFFICIENT_INFORMATION`) `→ NOT_EVALUATED` — a platform capability being ready does not mean
  anything was built for a specific project (Master Spec §4.4, `D-0011`). Every status entry references
  the `ProductEvidence` record that justifies it. Wired into `generateProductIntelligence` (syncs Truth
  Status from the Feasibility Report, records a `PRODUCT_STATE_VERSION_CREATED` event) and the Decision
  Ledger (`DECISION_RECORDED`/`DECISION_RESPONDED` events). 15 new tests plus 2 pre-existing suites
  re-verified against the new side effects (122 total). Evidence: `EV-0026`..`EV-0029`.
- **P1-08 — Integrations, credential-vault architecture, governance profile.** `IntegrationRequirement`
  is upsert-by-`(project, category)` (Master Spec §30) — current connection state, not an intelligence
  artifact needing history. The credential vault (`src/lib/credentials/`) is real AES-256-GCM: a fresh
  random IV per `encryptSecret` call, GCM's auth tag detects tampering (verified with dedicated tests),
  keyed by a server-only `CREDENTIAL_ENCRYPTION_KEY`. `storeCredential`/`retrieveCredentialSecret` are
  the only functions that ever touch plaintext; `getCredentialMetadata` is a separate, deliberately
  narrower accessor that never returns ciphertext/iv/authTag, so it's safe to expose broadly (`D-0012`).
  `GovernanceProfile` is one mutable profile per project (§32) — deliberately excludes the full external
  Governance Requirement Registry, since Continuous Governance Monitoring is explicit Phase 3 scope
  (§33, §65). `PolicyDocument` is versioned per `(project, type, language)` (§34/§35) — durable model
  only, no generation logic yet (drafting is optional per §34, not a Phase 1 requirement). 23 new tests
  plus a 5-test crypto suite (145 total). Runtime-verified: `npm run build && npm run start` still boots
  and `/api/health` still reaches Postgres with the new required env var. Evidence: `EV-0030`..`EV-0034`.
- **P1-09 — Plans, entitlements, billing-state architecture.** `PlanDefinition` is platform-wide,
  versioned per `planKey` (same pattern as the Capability Registry) — only Free/Explore has a real,
  known price (0); every paid plan's price is left unset rather than invented (Master Spec §36).
  `OrganizationSubscription` is one row per organization (billing is account-level, not project-level);
  every organization gets a Free/Explore, TRIALING subscription at creation so entitlement checks never
  special-case "no subscription." `billingState` changes only through `nextBillingState`, a deterministic
  state machine mirroring §37's failed-payment workflow exactly — full access persists through
  PAST_DUE/PAYMENT_RETRYING/GRACE_PERIOD (nonpayment must not trigger immediate restriction), only
  RESTRICTED/SUSPENDED/CANCELED/etc. drop to "restricted" (never fully blocked — login, billing access,
  payment updates, read-only projects, portability export, support, and cancellation stay available per
  §37), and only actual `DELETED` has no access. Every transition is recorded as an immutable
  `BillingEvent` (`D-0013`). 22 new tests, including a full walk of the entire failed-payment sequence
  and rejection of invalid transitions (167 total). Evidence: `EV-0035`..`EV-0038`.

- **P1-10 — Premium landing, auth/onboarding, dashboard, Studio shell (Simple + Expert Mode).** Server
  Actions (`src/lib/actions/`) wrap the entire M1-foundation service layer for the first time: sign-up/
  sign-in/sign-out, organization + project creation (creating an org also calls `createSubscription`, so
  every workspace has real billing state from birth), idea submission (`beginChangeFlow`), and decision
  approval/decline. Simple Mode renders Product DNA, pending-decision approval cards, a Business section
  from the real Business Model Brief, and a Trust section listing real `TruthStatusEntry` rows with
  color-coded badges. Expert Mode renders the same underlying state structurally: Product State version
  history, the full Decision Ledger, and the Event Ledger. Caught two real bugs by actually running the
  app in a browser rather than trusting unit tests alone: (1) an unauthenticated visitor hitting a
  protected page got an uncaught 500, not a redirect — fixed with a dedicated `requireUserForPage` page
  guard, `requireCurrentUser` kept as-is for service/API contexts (`D-0014`); (2) the dev database's
  Capability Registry was never seeded outside of tests, so every Feasibility assessment showed
  "Not evaluated" instead of the real "Planned" status — fixed with `prisma/seed.ts` (`npm run db:seed`,
  requires `NODE_OPTIONS=--conditions=react-server` to bypass `server-only`'s bundler-only guard under
  plain Node) (`D-0015`). Verified with `e2e/golden-path.spec.ts`, a real Playwright/Chromium test that
  drives the actual §51 flow — landing → sign-up → onboarding → project creation → idea submission →
  generated Product Intelligence visible in both modes — against a real production build and Postgres,
  not mocks. curl could not have validated any of this: React Server Actions use their own RPC protocol,
  not a plain form POST a generic HTTP client can drive. Evidence: `EV-0039`..`EV-0040`.

- **P1-11 — First customer flow end-to-end + validation suite.** Closed the last two real gaps against
  Master Spec §51: unit-economics assumptions are now genuinely editable (`updateUnitEconomicsAssumptions`
  merges only explicitly-submitted fields onto the latest Product State version, carrying everything else
  forward — `D-0016`), and a new "Launch" section surfaces output targets, required integrations, and
  governance requirements that existed in the data since P1-06 but had no UI. Expanded
  `e2e/golden-path.spec.ts` to drive every Phase-1-scoped §51 step in one real-browser run: decision
  approval on a CONSEQUENTIAL monetization follow-up, the unit-economics edit round-trip (including proof
  that an untouched field survives), the Launch section, and sign-out/sign-in persistence. Stress-tested
  the suite with `--repeat-each=5` under artificial parallel load and found two genuine flakiness sources
  before they could cause false CI failures: `Date.now()`-based test-data uniqueness collided under rapid
  repeated runs (fixed with `crypto.randomUUID()`), and one assertion depending on a real multi-step DB
  write (intent resolution + impact analysis + decision recording) exceeded the default 5s timeout under
  load (fixed with an explicit longer timeout, not a blind sleep — root-caused per Execution Protocol §9,
  `D-0017`). Verified stable across 5/5 and 3/3 repeated runs after the fix. Evidence: `EV-0041`..`EV-0043`.
- **P1-EXIT — Phase 1 evidence assembly and Level 3 independent review.** Two review rounds. **Round 1**
  (commit `890d38d`): verdict **revise**. The independent reviewer reproduced 3 DEFECTs live against a
  genuinely wiped-and-remigrated environment: the e2e suite failed from an unseeded database (nothing
  ran `prisma/seed.ts` automatically); `createProjectAction` crashed on a forged cross-tenant
  `organizationSlug` instead of failing gracefully; `registerUser` had no server-side minimum password
  length (the HTML `minLength` was client-side only). Plus one IMPROVEMENT: D-0014's fix was real but
  had no automated regression test. **Fixes** (commit `3739836`, `D-0018`): `e2e/global-setup.ts` wires
  `npm run db:seed` into Playwright's startup; `project-actions.ts` now catches `ForbiddenError`
  gracefully; `registerUser` now enforces an 8-character minimum server-side; `e2e/auth-guard.spec.ts`
  and `e2e/tenant-isolation.spec.ts` added as regression coverage. Each fix verified by reproducing the
  reviewer's own steps. **Round 2** (commit `3739836`): verdict **accept** — the same reviewer
  independently re-verified every fix, including authoring its own separate adversarial script for the
  cross-tenant finding rather than trusting the shipped test, and found nothing new introduced by the
  fixes. **Phase 1 is complete.** Evidence: `EV-0044`..`EV-0047`. Full report:
  `execution/reviews/level3/phase-1/PHASE_1_COMPLETION_REPORT.md`.

## Active

- None. Phase 2 is complete (tag `phase-2-complete`, commit `dfefbb2`). Awaiting explicit user
  authorization to begin Phase 3 — see `execution/state.json`'s `nextAction`.

## Deferred

- Phase 3 in full (live billing, real AI provider connections, production managed hosting, real store
  submission, continuous governance monitoring, unrestricted autonomous production changes, broad
  marketplace support, mature Product Outcome Graph, Human Expert/developer marketplaces, capital
  network) — per Master Spec §58/§65's own phase structure, not a scope-reduction decision.
- Within Phase 2 itself, intentionally not built (see Master Spec §58 and the per-unit "Honest
  limitation" notes above): true screen/field-level selective regeneration (P2-08 is category-level);
  Build Plan/Product State restore (P2-09 restores Blueprint only); a per-check Quality Gate/Store
  Readiness UI breakdown (P2-17 surfaces the aggregate rationale only); 10 of 13 policy-document content
  generators (P2-11); migration-plan auto-application on destructive Change Sets (P2-12, standalone
  tool only); real code-file/deployment export (P2-13, structured JSON bundle only); a mobile
  equivalent of the web Structured Renderer/Interactive Runtime (P2-15, static navigation scaffold
  only); a real native mobile build (no Xcode/Android SDK in this environment); real Apple/Google
  developer account integration (P2-16, `readinessStatus` is honestly always `NOT_READY`); a dedicated
  "Operate" Studio surface (P2-17, describes production monitoring systems that don't exist yet).

## Blocked

- None. Phase 2 required no live credentials for its core generation architecture — mock/deterministic
  generation remains valid per Execution Protocol §8. Real AI provider connections, real payment
  provider webhooks, and real Apple/Google developer account integration are all Phase 3 scope (§61,
  §62, §65).

## Known Limitations (truthful, current — Phase 2 scope)

See `execution/state.json`'s `knownLimitations` array for the complete, current list (one entry per
implementation unit plus cross-cutting items) — kept there as the single source of truth to avoid two
copies drifting apart. Every Phase 1 known limitation not resolved by Phase 2's scope still applies
(see `PHASE_1_COMPLETION_REPORT.md`).

## Next Action

See `execution/state.json`'s `nextAction` (kept as the single source of truth). Summary: Phase 2 is
complete and checkpointed. Report this outcome to the user and stop — Phase 3 ("Commercial Production,
Billing, Deployment, Mobile Distribution, Governance Monitoring, and Operations," Master Spec §60-66)
requires explicit user authorization to begin, given its real credentials and materially higher risk
profile (live billing, real production charges, real store submission) than anything auto-approved so
far. Do not begin Phase 3 decomposition or implementation without that explicit authorization.

## Decision Ledger Pointer

See `execution/decisions/ledger.jsonl` (build-process architecture decisions). Product-facing Decision Ledger (Master Spec §15, a Phase 1 customer-facing capability) will be implemented as an application data model, not conflated with this file.

## Evidence Ledger Pointer

See `execution/evidence/ledger.jsonl` (Evidence Contract v1, Execution Protocol §10).

## Review Log Pointer

See `execution/reviews/` for Level 1/2/3 review records per Review Protocol.
