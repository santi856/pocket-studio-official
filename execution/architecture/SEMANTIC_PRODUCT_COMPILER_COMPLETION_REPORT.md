# Semantic Product Compiler — Completion Report

**Status:** Stable checkpoint. **Scope:** the founder-discovered semantic-hollowing defect and its full, founder-scoped repair — nothing else.
**Governing documents:** `execution/architecture/SEMANTIC_PRODUCT_COMPILER_REPORT.md` (pre-implementation design), this report (completion).
**Ledger range:** D-0065/EV-0110 through D-0075/EV-0120. Commits `71872dd` through `863f9d2`.
**Standard applied throughout:** do not optimize for elegance; optimize for a product the founder can confidently test and evaluate. Every claim below is either a number I re-ran myself in this session or a fact I re-checked directly against the current source, not carried forward from memory.

---

## SECTION 1 — Executive Summary

**What was broken.** You described a household-management app ("HomeBase") in realistic detail — multiple roles (Family Members, Parents, Children), a recurring-chore workflow, several domain entities (chores, groceries, expenses, appointments, rewards). The pipeline reported Blueprint VALID, Build Plan READY, Quality Gate passed — and produced `roles: ['customer']`, one generic "Record" data model, no workflows, and a generic "Home" screen. Nothing about your description survived. Separately, the Studio page displayed `businessModelBrief.revenueModel` ("No revenue model was described") directly above a monetization recommendation ("one-time payment") with no fact-vs-recommendation label — a real contradiction, not a UI nuance.

**Root cause.** `analyzeImpact()` classified product descriptions against a fixed 15-category, ~90-keyword substring list. Your description matched 2 of 15 categories. `validateBlueprint()` and `runQualityGate()` were both intentionally structural-only — by their own docstrings — with no dimension that could ever notice that *meaning* had been dropped. A Blueprint can be perfectly self-consistent and still not be what you asked for; nothing checked for that gap. This was not a HomeBase-specific bug — it reproduces for any description that doesn't happen to hit this pipeline's fixed keyword set.

**Final solution, in one sentence.** A new, versioned, domain-agnostic `ProductSemanticModel` sits between your description and Blueprint generation, populated by a real `AIProvider.extractProductSemantics()` call (Anthropic when configured, a disclosed low-confidence deterministic heuristic fallback otherwise), checked by a new deterministic Semantic Coverage Engine, enforced by a 12th Quality Gate check that now *fails* generation when coverage is materially incomplete, and disclosed honestly through Truth Status — including to conversational edits, not just first-time generation.

**Final verdict.** The originally reported defect is fixed and independently re-verified: the same HomeBase description, run through the complete final system, now produces 3 real actors and 7 real entities, and a genuinely hollow description (verified with a fresh, adversarial passive-voice case) is hard-blocked rather than silently accepted. Seven rounds of independent, fresh-context Level 3 review ran against this repair. The first four rounds closed a convergent vocabulary-corruption problem in the deterministic fallback extractor. The next three rounds (5, 6, 7) each found a new, unrelated, live, reproducible way the same fallback extractor's *syntax* handling could produce a false "found nothing" result — and round 7, asked explicitly to hunt past what earlier rounds covered, found four in one pass. Three of those four are fixed and verified in this checkpoint. The fourth is deliberately, honestly left unfixed, because the two available ways to close it were tested and rejected as worse than the disclosed gap (see §4, §6). No eighth review round was spawned — round 7's own explicit assessment, and my own judgment applying it, is that continued narrow syntax-patching of a hand-rolled regex heuristic is not a converging process, and further narrow rounds would likely keep finding new punctuation/structure variants rather than reach zero. That conclusion is the most important thing in this report, more important than any individual number below — see §7.

---

## SECTION 2 — Repository Changes

**New Prisma model:** `ProductSemanticModel` (migration `20260715110501_product_semantic_model`) — versioned, append-only, domain-agnostic. Fields: `purpose`, `targetUsers`, `actors`, `entities`, `workflows`, `capabilities`, `permissions`, `businessRules`, `monetization`, `integrations`, `constraints`, `unresolvedQuestions`, `consequentialDecisions`, `unsupportedRequirements`, `usage`, `coverageResult`, `generationMetadata`. Every item carries a `provenance` object (`sourceType`, `sourceExcerpt`, `confidence`) — nothing is asserted without a traceable origin.

**New/changed source modules:**
- `src/lib/ai/provider.ts` — new `AIProvider.extractProductSemantics()` method on the existing real-provider-abstraction interface (same pattern as the rest of this codebase's provider abstractions: a real interface, a `Mock` default, a real implementation).
- `src/lib/ai/anthropic-provider.ts` — `extractProductSemantics()` makes a real Anthropic Messages API call with forced tool-use; on request failure or a malformed response, after its retry budget, falls back to the same deterministic heuristic `MockAIProvider` uses unconditionally — never silently degrades without recording `confidence: "low"` provenance.
- `src/lib/ai/heuristic-extraction.ts` (new) — the deterministic, language-generic fallback. No per-domain vocabulary of any kind (enforced by a permanent anti-hardcoding meta-test that greps this file for every regression fixture's distinctive nouns). Went through 7 rounds of independent review; final state described in full in §4/§6.
- `src/lib/product/semantic-model.ts` (new) — persistence/versioning for `ProductSemanticModel`, mirroring the existing `db-versioning.ts` pattern used by Blueprint/BuildPlan/ProductState.
- `src/lib/generation/semantic-coverage.ts` (new) — the deterministic Semantic Coverage Engine. `computeExtractionCoverage()` checks whether extraction itself found anything per dimension; `computeBlueprintSemanticCoverage()` checks the deeper question — did what was extracted actually reach the generated Blueprint's `roles`/`dataModels`/`workflows`, or was it silently dropped downstream. Both produce `SemanticCoverageReport` with an `overallStatus` of `adequate` or `materially_incomplete`.
- `src/lib/generation/blueprint-generator.ts` — unions semantic-model actors/entities/workflows into Blueprint generation (never replacing the existing Impact Analysis path), records `generationMetadata.semanticCoverage`, `basedOnSemanticModelVersion`, `semanticExtractionMode`, and escalates a "substantial description, zero actors found" extraction-time signal into the same coverage object the Quality Gate reads.
- `src/lib/generation/quality-gate.ts` — new 12th check (`checkSemanticCoverageAdequate`), new `semanticFidelity` dimension (6th, alongside structural/behavioral/accessibility/governance/operational), following the pre-existing "one subjectKey per real axis" pattern. This check `passed: false`s a Blueprint whose semantic coverage is `materially_incomplete` — the concrete mechanism that makes semantic hollowness block, not just get noted.
- `src/lib/generation/generation-orchestrator.ts` — `generation.full_stack_web_app` Truth Status rationale now discloses semantic-coverage gaps inline; a new, always-recorded `semantic.fidelity` Truth Status subject key (`IMPLEMENTED` / `BLOCKED` / `NOT_EVALUATED`) makes semantic fidelity visible as its own signal.
- `src/lib/orchestration/change-set.ts` — `createChangeSet()` now also runs the free deterministic heuristic (never the paid provider — the real provider still runs exactly once, inside `applyChangeSet`'s existing regeneration call) against conversational-edit text, and triggers regeneration when it names a new actor/entity the current semantic model doesn't have, even when the pre-existing category-keyword system finds nothing.

**No schema migration beyond the one new model.** Truth Status's existing flexible `subjectKey` ledger absorbed the new `semantic.fidelity` key with no migration. Quality Gate's existing dimension/check-array pattern absorbed the 12th check and 6th dimension the same way.

**New regression suites:** `semantic-multi-domain-regression.integration.test.ts` (9 domain fixtures + 1 novel holdout, written after the code + never patched to fit it, per the founder's own explicit no-post-hoc-patching rule; plus a growing "phrasing-diverse regression" section — one fixture per independently-found construction gap, from round 1 through round 7).

---

## SECTION 3 — Proven Capability

Everything below is either a live re-run I performed in this session or a permanent, currently-passing regression test — not a description of intended behavior.

- **The original defect, fixed and re-verified.** The exact HomeBase description, run through the complete final pipeline, now extracts 3 actors (Family Members, Parents, Children) and 7 entities including real domain concepts (Chore, Reward, Task, alongside some low-confidence noise the system honestly discloses, not hides). All 12 Quality Gate checks pass.
- **9 distinct product domains + 1 never-before-used holdout**, generated end-to-end (service booking, B2B equipment maintenance, marketplace, education, internal ops, insurance, food ordering, peer-to-peer tool lending, plus the holdout) — every fixture's actors/entities/workflows reach the generated Blueprint, verified by the pipeline's own coverage report, not a hand-inspection.
- **A genuinely hollow description is now hard-rejected, not silently accepted.** A substantial, pure-passive-voice description (the one honestly-disclosed construction this heuristic cannot parse) fails the Quality Gate with `passed: false` and blocks `quality.semanticFidelity` Truth Status — this is the direct, load-bearing proof that "semantic hollowness must block READY status" is real, not aspirational.
- **Truth Status tells the truth about coverage gaps**, inline, at the moment generation completes — not only when a founder separately chooses to run the Quality Gate.
- **Conversational editing uses the same semantic reasoning as first-time generation.** An edit naming a brand-new actor in ordinary language, with zero overlap with the old category-keyword system, now correctly triggers regeneration — verified live, at zero added AI-provider cost (confirmed by direct source inspection: `createChangeSet` never calls `getAIProvider()`).
- **Common, ordinary phrasing variations are correctly handled**, each backed by a permanent regression test tied to the review round that found the gap: non-modal active voice, passive voice (disclosed miss, never silent), function words between subject and verb, compound role names in either the lowercase-second-word or Title-Case-Both-Words convention, leading dependent clauses (comma-marked), semicolon-joined clauses, hyphenated compound names, and bulleted/dash-prefixed role lists.

---

## SECTION 4 — Capability Boundaries

Stated as plainly as the founder's own standard demands — no overstatement.

1. **The deterministic fallback extractor is a disclosed, reduced-intelligence mode, not real language understanding**, and this session found real limits to how far a hand-rolled regex heuristic can be pushed. It reliably handles single-sentence, comma/semicolon/and/but-joined, non-hyphenated-*and*-hyphenated actor phrasing in either common-noun capitalization convention. It does **not** reliably handle: passive voice; a lowercase (non-capitalized) actor noun; a verb outside its fixed ~25-word organizational-verb list; a parenthetical/participial insertion between subject and verb; and, confirmed and left deliberately unfixed this session, **a leading subordinate clause with no comma before the actor** (e.g. "When a new request arrives Managers can review it," as opposed to the comma-marked form, which is fixed). Each of these produces a *safe miss* (nothing extracted for that construction) — none has ever been shown to corrupt a name — but a safe miss for a substantial description can itself trip the hard Quality Gate block.
2. **This means the hard gate has real, demonstrated false-positive exposure** for ordinary, non-hollow descriptions using constructions outside the list above. Three vectors were found and closed this session (semicolon, hyphen, bulleted list) on top of two found and closed in the two rounds before it (sentence position, case-sensitivity). One is known and open (comma-less subordinate clause). Given the pattern across the last three review rounds — three rounds, three unrelated root causes, the last one finding four at once — it would be dishonest to claim this list is now exhaustive. It almost certainly is not.
3. **`AI_PROVIDER=mock` is this repository's own default**, and no live Anthropic credentials are configured in this build. This means the deterministic heuristic described above — not real AI-backed extraction — is what actually runs for ordinary usage today. `AnthropicAIProvider.extractProductSemantics()` is real, tested against a scripted fake API, and structurally correct, but has never been exercised against the live Anthropic API in this build (same `PROTOTYPE_ONLY` status the rest of this codebase already applies to live AI provider usage). The mechanism that has absorbed seven rounds of adversarial review effort is, by the system's own design, the fallback path — not the intended primary one.
4. **Requirement traceability was explicitly out of scope for this repair**, per the founder's own original scope rules — a generated Blueprint's individual screens/fields do not carry a `sourceRequirementIds`-style link back to the specific sentence that produced them. Coverage is checked at the actor/entity/workflow-name level, not deeper.
5. **The partial-actor-loss disclosure gap is only partially closed.** The hard gate catches the "found zero actors for a substantial description" case. It does not catch every case where *some* actors were found but one specific actor was silently dropped mid-pipeline for an unrelated reason — the Blueprint-level `computeBlueprintSemanticCoverage()` check catches drops between the semantic model and the Blueprint, but a construction the extractor never recognized in the first place (see item 1) produces no signal that anything was missed at all, beyond the aggregate zero-actor case.
6. **No new Capability Registry entry exists for semantic understanding.** Unlike `ai.live_provider_intent_resolution`, this initiative's capability has not been registered as a platform-level capability with its own status — it lives only in Truth Status per-project, and in this report.

---

## SECTION 5 — Validation

All figures below were produced by commands I ran directly in this session against commit `863f9d2` (the current HEAD), immediately before writing this report — not carried forward from an earlier point in the initiative.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings=0` | clean |
| `npx prettier --check .` | clean |
| `npx vitest run` | **722/722 passed**, 98 test files |
| `rm -rf .next && npx next build` | succeeds, all 16 routes compile |
| `npx playwright test` | **24/24 passed** |

**Founder verification:** the original HomeBase description, re-run through the complete final system (§3).
**Holdout result:** VolunteerHub (nonprofit volunteer-shift scheduling), never referenced anywhere in this initiative's code or fixtures before its own evaluation, passed clean on first run — 2 actors, 4 entities, all 12 Quality Gate checks green.
**Independent Level 3 review:** 7 rounds total, each a fresh-context agent in an isolated git worktree with no memory of prior rounds, each personally re-running the full validation suite rather than trusting the implementer's account.

- **Rounds 1–4** (on `heuristic-extraction.ts`'s original name-corruption bugs): each found a genuine, live-reproduced CRITICAL DEFECT (a modal, then a function word, then an unlisted adverb getting swallowed into a captured actor name); each repaired with a converging structural fix, culminating in round 4's positive `ROLE_SUFFIX_WORDS` allowlist replacing an admittedly-unconvergent negative blocklist. Round 4 explicitly recommended closing this specific review cycle — accepted (D-0071).
- **Round 5** (D-0072 batch: hard gate, Truth Status, edit-path wiring): verdict REVISE. Found the hard gate's actor regex was anchored to a sentence's own start (missing any leading clause) and that the claimed `NOT_EVALUATED` Truth Status safety net was unreachable in practice. Both fixed and re-verified (D-0073).
- **Round 6** (scoped to round 5's fix): verdict REVISE. Confirmed round 5's fix correct, then found — via its own adversarial testing, not a re-litigation — a second, unrelated root cause producing the identical false-block symptom: case-sensitive role-suffix matching. Fixed and re-verified (D-0074).
- **Round 7** (scoped to round 6's fix, explicitly asked to hunt for a different failure class): verdict REVISE. Confirmed round 6's fix correct and general, then found four more unrelated constructions producing the same symptom in one pass. Three fixed; the fourth deliberately disclosed, not fixed (D-0075) — see §4, §6.

No review round found a defect that had been previously fixed and regressed. Every fix has held under every subsequent round's re-testing.

---

## SECTION 6 — Remaining Technical Debt

Ordered by severity, then by estimated effort within each tier.

1. **[HIGH, unknown-but-nonzero effort] The deterministic fallback extractor's syntax coverage is not exhaustively known.** One disclosed gap (comma-less subordinate clause) is open by deliberate choice, not oversight — see §4, §7 for why a fast fix was rejected. The honest statement is: nobody has proven there isn't a fifth, sixth, or seventh construction still undiscovered. Do not treat "7 review rounds" as evidence of near-completeness; round 7's own result is evidence against that reading.
2. **[HIGH, moderate effort] The real AI-backed extraction path (`AnthropicAIProvider.extractProductSemantics`) has never been exercised against the live Anthropic API in this build.** All the adversarial rigor in this initiative has gone into hardening the disclosed fallback, not the intended primary mechanism. This is the direct subject of §7's recommendation.
3. **[MEDIUM, small effort] The hard Quality Gate's rejection message ("Review the original description manually") is not actionable.** A founder who hits a false positive from an undiscovered syntax gap has no way to self-diagnose why. A better message would name which sentences/clauses the extractor could not parse, not just that it found nothing.
4. **[MEDIUM, small-to-moderate effort] `NOT_EVALUATED` for `semantic.fidelity` is now reachable, but only via the specific `basedOnSemanticModelVersion == null` signal** — a project that has a semantic model but one so old it predates a later coverage-computation change would not be distinguished from one with fully current coverage. Not observed as a live problem; worth a note for whoever next touches this code.
5. **[LOW, small effort] No Capability Registry entry exists for semantic product understanding** as a platform capability (see §4 item 6). Low priority — Truth Status already covers the per-project disclosure need this initiative's actual defect required.
6. **[LOW, unclear effort — a genuine open question, not a task] Whether "zero actors from a substantial description" should remain a hard production-deployment block, or become a strong, unmissable, non-blocking warning instead**, given how many false-positive vectors this specific signal has been shown to have. This is a real product-policy tension the founder authorized (the hard gate is exactly what was asked for) and this report is not overriding — but it is worth the founder's own explicit reconsideration now that the false-positive surface has been demonstrated to be wider than assumed when D-0072 was authorized.

---

## SECTION 7 — Recommended Next Milestone

**Recommend exactly one:** verify and harden the real AI-backed semantic extraction path (`AnthropicAIProvider.extractProductSemantics`) against the live Anthropic API, and make it the path a real founder's usage actually exercises — rather than continuing to invest adversarial-review effort into the deterministic regex fallback.

**Why this one, and not a continuation of the fallback-hardening work.** Three consecutive independent review rounds (5, 6, 7) each found a new, unrelated, live way for the deterministic fallback's syntax handling to fail — and the most recent round, explicitly asked to hunt past what earlier rounds covered, found four in a single pass rather than a narrowing trickle. That is direct evidence the fallback's true failure surface is wider than assumed, and that further narrow patching is unlikely to converge the way the earlier vocabulary-corruption fix did. Meanwhile, the mechanism this whole initiative's design always intended as primary — real AI-backed extraction — has received essentially none of that same scrutiny: it has never been called against the live Anthropic API in this build, its own retry/fallback boundary has only been tested against a scripted fake response, and `AI_PROVIDER=mock` remains this repository's own default. The founder is currently trusting the harder-to-trust path by default.

**What this milestone concretely means:** (a) exercise `AnthropicAIProvider.extractProductSemantics()` against the real Anthropic API across the same multi-domain corpus this initiative already built (9 fixtures + the holdout + the phrasing-diverse regression set), to establish real-world accuracy, cost, and latency figures that do not yet exist anywhere in this codebase; (b) decide, with real data instead of an assumption, what `AI_PROVIDER`'s default should be for a real founder's first experience; (c) only after that evidence exists, decide whether further investment in the deterministic fallback's syntax coverage is still worth it, or whether its scope should instead be explicitly frozen and documented as "handles common phrasing; anything else should degrade honestly, not silently misfire into a confusing hard block" — which is closer to what this fallback's own module docstring already says it was always meant to be.

Not recommended, and explicitly rejected for this slot: a further round of narrow regex patching against the fallback extractor (diminishing, likely non-converging returns, per §6 item 1); the separate 14-concept architecture brief's Stage 1 audit (correctly sequenced by the founder's own prior decision to come *after* this checkpoint, not folded into it); any Phase 4 work.
