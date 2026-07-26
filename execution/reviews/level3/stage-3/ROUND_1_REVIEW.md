# LEVEL 3 — PHASE-EXIT ADVERSARIAL REVIEW

## Stage 3 — Knowledge Graph Relationship Population + Impact Analysis Consumer (D-0082→D-0088 / EV-0127→EV-0133)

Baseline: commit `b5e78eb` (D-0081 acceptance). HEAD reviewed: `6df684b`. Reviewer read the full diff `b5e78eb..HEAD` directly, not the ledger summaries.

### Independence status (Review Protocol §2)

**Independent.** Conducted by a freshly spawned subagent with no access to build-conversation history, implementer reasoning, or hidden chain-of-thought. It received only the three governance documents, repository state, and the Decision/Evidence Ledgers, and derived the diff, tests, and evidence itself. This satisfies the §2 independence gate. No fallback-to-non-independent condition applies.

### Verification actually performed (not trusted from the ledger)

- Real full suite (`npx vitest run`): 85 files executed → 577/577 passed, 0 failures, 0 skips. The other 20 files hit fork-worker startup failures under CPU contention the reviewer itself created (concurrent tsc/eslint), not test failures — the environmental fragility already disclosed in knownLimitation [22] and EV-0127/0128.
- Re-ran all 20 under low load: the 5 Stage-3-critical files (`graph-projector.test.ts`, `impact-analysis-graph.test.ts`, `impact-analysis.test.ts`, `verify-tenant-isolation.test.ts`, `blueprint-validation.test.ts`) → 67/67 pass. Remaining 15 → 14 passed; `verify-migration-safety.test.ts` hit a 5s timeout under residual load, then passed 7/7 in isolation. Net: every test passes when given adequate resources; zero real assertion failures.
- `f8f4894..HEAD` confirmed ledger/state-only (0 code/test changes), so EV-0133's genuine 777/777 run at f8f4894 remains valid for HEAD.
- Typecheck: 0 errors in real source (347 pre-existing errors traced to gitignored filesystem-sync duplicate files, unrelated to this slice — see Deferred).
- Lint: clean; Stage 3 source is idiomatic.
- Tenant-isolation gate: `verify-tenant-isolation.test.ts` (14 tests, including the zero-violations-across-src/lib gate) green, independently confirming D-0088 against every Stage 3 addition.

### What is good (STRENGTHS)

- Feature-flag safety claim (D-0084/EV-0129) verified in code: `src/lib/env.ts:25` — `IMPACT_ANALYSIS_MODE` defaults to `"keyword"`. Default path unchanged.
- `disclosureTier` — the one live safety mechanism in scope — genuinely untouched. `change-flow.ts:91-95` computes it purely from the keyword classifier's `impact.consequential`; the graph block (lines 109-126) only enriches `impactRecord` content in graph mode when the target resolves, never feeds `disclosureTier`. `GraphImpactAnalysisResult.requiredApprovals` is always-empty by design. CONSEQUENTIAL approval gating cannot be perturbed by this slice.
- Authorization boundary real across every named call chain (D-0088): `createKnowledgeEdge`/`createKnowledgeNode`/`getKnowledgeGraph`/`listKnowledgeNodes`, `recordEvidence`/`listEvidence`, `addProductMemoryEntry`, `runQualityGate` each call `requireProjectAccess`. `createKnowledgeEdge` additionally enforces both endpoints belong to the same project — real cross-tenant graph-wiring defense.
- Tenant-isolation tool confirmed to genuinely be a generic AST scanner (D-0088): scans every non-test `.ts` under `src/lib`, flags any exported tenant-scoped function that cannot transitively reach an authz root, no per-feature registration required. Both prior Level-3 fixes to this tool remain intact — no §8 regression.
- Both D-0081 corrections carried through in implementation, not just recorded: the edgeType/provenance migration is explicit and real; VERIFIED_BY is genuinely absent from the enum, `APPROVED_EDGE_TRIPLES`, and `STRUCTURAL_EDGE_TYPES` — 3 edge types, not 4.
- Honest failure semantics: `projectBlueprintRelationships` never throws on an unresolvable candidate, records `missing[]`, surfaced as a non-blocking Quality Gate check. Edge-creation failure cannot block generation.
- Conservative resolution ("unknown over guessing"): word-set fuzzy matching and ambiguity fallback correctly refuse to resolve rather than mis-resolve; the "Pay" vs "Payment" false-positive fix is real and regression-tested.
- Test integrity (§6): clean. All test changes are pure additions; no assertion removed, no `.skip`/`.only`, no weakening.
- "No route/UI/build-affecting file" claim confirmed TRUE — diff touches only `src/lib/**`, `prisma/**`, `execution/**`, `.env.example`. Skipping e2e/production-build re-runs for this slice is defensible.

### What is bad or weak

- DEFECT (documentation, non-blocking): state.json/EV-0133 claim "105 test files, 777 tests." Disk/git show 103 `*.test.ts` files; vitest scheduled 105. Off by ~2; every test that runs is green, so this does not affect correctness.
- IMPROVEMENT: `change-flow.ts:110-111` passes the entire raw request sentence as `changeTargetLabel`. Longer requests raise the chance of ambiguous multi-match. Low severity — graph mode is off by default and enrichment never gates anything.
- OVERBUILDING (minor, spec-mandated): `wouldCreateDependsOnCycle` and the `isApprovedEdgeTriple` guard are effectively dead defense-in-depth today given the current producer shapes. Disclosed in code and mandated by the architecture proposal; acceptable.
- UNDERBUILDING note (disclosed, not hidden): because the flag defaults to `keyword` and no route/UI ever sets it to `graph`, the entire graph-impact consumer has zero production-reachable surface today. Intended conservative rollout (D-0084); not a defect, but scope reality to state plainly.
- CUSTOMER-RISK / OPS finding (environmental, pre-existing, NOT Stage 3): 347 pre-existing `tsc` errors and full-suite fork-worker timeouts both traced to pervasive filesystem-sync duplicate litter (`* 2`/`* 3`/`* 4`/`* 5` files under gitignored `.next/`, `src/generated/prisma/`, `test-results/`) — classic iCloud/Documents sync conflict copies. Not attributable to Stage 3. **Resolved same-session**: the litter directories were removed and the Prisma client regenerated cleanly (see D-0089).

### What must be done now (blocking)

Nothing. No unresolved defect blocks phase exit. The one real test failure encountered (`verify-migration-safety`) was a load-induced timeout that passes 7/7 in isolation; Stage 3's own migration (`DROP INDEX` / `ADD COLUMN … NOT NULL` on a confirmed-empty table) does not match any destructive pattern the migration-safety analyzer flags.

### What can wait (DEFERRED)

- Reconcile the 103-vs-105 test-file count in state.json/EV-0133 at the next checkpoint.
- Narrow `changeTargetLabel` to an extracted intent phrase if/when graph mode is promoted toward a customer-facing surface.
- Environment hygiene (filesystem-sync litter): resolved this session (D-0089); no further action unless it recurs.

### What should be removed or simplified

Nothing must be removed now. If a future slice does not ship VERIFIED_BY/business-metric nodes, consider trimming `GraphImpactAnalysisResult`'s always-empty fields then.

### Audit sample (§7) — 3 randomly selected previously-resolved findings, re-verified against current behavior

1. D-0031/EV-0069 (Quality Gate; tenant isolation structurally guaranteed, not re-fuzzed per generation) — still effective, limitation string present, original checks intact (now 13). Not regressed.
2. D-0042/EV-0087 (pre-Phase-3 audit fork; committed repair d912048; corrected 3 stale registry entries) — still effective, commit present, all 3 corrected entries present in source. Not regressed.
3. D-0053/EV-0098 (sign-in rate-limiter hardening, 5 fixes) — all still effective (advisory lock, composite key/index, timing-equivalent dummy hash, client-ip helper present, `clearLoginAttempts` removed). Not regressed.

All three findings were real, their resolutions remain effective, evidence remains valid, none has returned.

### Prior-finding regression (§8)

Tenant-isolation analyzer's two prior Level-3 defects (round-1 bare-name keying; round-2 local impersonator) remain fixed and its zero-violation gate passes over all Stage 3 code. The semantic-hollowing class (D-0065, knownLimitations) is not repeated or overclaimed — the graph is projected from the same deterministic categories and honestly degrades under it rather than masking it; no decision record claims Stage 3 resolves semantic hollowing.

### Test integrity (§6)

Clean — additions only; no weakening, skipping, deletion, or behavioral-to-shallow substitution.

---

## FINAL JUDGMENT: ACCEPT (with deferred improvements)

The slice does exactly what D-0081 approved, no more: it populates real CONTAINS/TRIGGERS/DEPENDS_ON edges from generation, adds a feature-flagged (default-off) graph impact consumer, a non-blocking Quality Gate disclosure, and Memory-Update wiring — all additive, all correctly authorized, with the sole safety-relevant mechanism (`disclosureTier`) provably untouched. Both D-0081 corrections are carried through in code. Independent testing shows zero real failures; the only anomalies encountered were environmental (fork-worker/timeout fragility already disclosed, and gitignored sync-duplicate litter traced to the filesystem, not the slice, and resolved same-session). No critical defect exists; no §4 CRITICAL DEFECT bar is met. Deferred items are non-blocking. Phase-exit acceptance is supported by EV-0127→EV-0133 and independently corroborated here.
