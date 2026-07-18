import "server-only";
import { deriveRequirementId } from "@/lib/orchestration/requirement-id";
import type {
  SemanticActor,
  SemanticCapability,
  SemanticEntity,
  SemanticExtractionResult,
  SemanticProvenance,
  SemanticWorkflow,
} from "@/lib/ai/provider";

/**
 * Deterministic, language-generic (never domain-specific) fallback used by
 * MockAIProvider.extractProductSemantics — and by AnthropicAIProvider when
 * a live call fails after its retry budget (execution/architecture/
 * SEMANTIC_PRODUCT_COMPILER_REPORT.md §15). This is a genuine, disclosed,
 * reduced-intelligence mode, not a second attempt to fake AI-level
 * understanding with more keywords: every item this module produces is
 * tagged `sourceType: "low_risk_inference"` and `confidence: "low"`,
 * never higher, and the Semantic Coverage Engine is expected to report
 * correspondingly lower coverage for mock-mode extraction — that is
 * honest, not a defect.
 *
 * Deliberately structural, not lexical: actor/entity detection is driven
 * by sentence position and a small set of common English organizational
 * verbs (manage, track, assign, create, ...), never by any product-
 * specific vocabulary — this file contains no per-domain word list of any
 * kind, by design (see semantic-multi-domain-regression.integration.test.ts's
 * anti-hardcoding guard, which enforces this permanently by scanning this
 * file's own source for any fixture's distinctive nouns).
 */

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

// Broad, common English verbs that indicate "an actor is doing something
// to/with a noun" — generic CRUD/organizational verbs, not any one
// product domain's vocabulary. Intentionally verb-only (structural), so
// this heuristic applies as well to a booking app, a marketplace, or an
// internal ops tool as it does to a household app.
const ORGANIZATIONAL_VERBS = [
  "manage",
  "track",
  "organize",
  "create",
  "assign",
  "complete",
  "view",
  "see",
  "show",
  "display",
  "browse",
  "book",
  "schedule",
  "review",
  "approve",
  "process",
  "handle",
  "monitor",
  "plan",
  "add",
  "edit",
  "delete",
  "share",
  "send",
  "receive",
];

// Every organizational verb's common inflections (base, third-person -s,
// past tense -ed, gerund -ing) — still purely grammatical, not a domain
// word list. Independent Level 3 review (post-D-0067) Finding 1: the
// original actor/entity patterns only matched a bare base-form verb, so
// "Managers assign tasks" (present tense, no modal) matched nothing,
// while "Managers can assign tasks" did — an arbitrary grammatical gap
// with no principled reason, not a deliberate scope boundary.
function withInflections(verb: string): string {
  const doubledConsonant = /[^aeiou]$/.test(verb) && /[aeiou][^aeiou]$/.test(verb.slice(-2));
  const stem = doubledConsonant ? verb + verb.slice(-1) : verb;
  const pastStem = verb.endsWith("e") ? verb.slice(0, -1) : verb;
  return `${verb}|${verb}s|${pastStem}ed|${stem}ing`;
}
const ORGANIZATIONAL_VERB_PATTERN = ORGANIZATIONAL_VERBS.map(withInflections).join("|");

// Round 3 independent review (post-D-0069) Finding R3-1, CRITICAL DEFECT,
// and its explicit architectural recommendation: rounds 1 and 2 each
// closed the optional second-word slot's greediness bug by excluding
// exactly the one word class that round's reviewer happened to test
// (copulas, then modals/organizational verbs) — a negative-lookahead
// blocklist grown one word class at a time never converges, because it is
// trying to exclude "any English word that isn't part of a role name,"
// which is not a small set if approached reactively. Round 3 found the
// next breakage (common adverbs — "Drivers also can track...", "Employees
// typically have...") and explicitly recommended closing the *class* in
// one bounded pass instead of patching one more instance. This list is a
// deliberately broad, one-time enumeration of common English function
// words (adverbs and conjunctions) that can grammatically sit between a
// subject and a modal/verb — a closed, stable, purely grammatical set,
// not product vocabulary, so it does not violate this file's "no domain
// word list" design principle (the anti-hardcoding meta-test scans for
// domain nouns, never grammar function words). Honest residual limitation
// (disclosed, not hidden, the same way passive voice already is): this is
// still an enumerated list, not true grammatical parsing — a function
// word absent from it (e.g. an unusual adverb, a parenthetical/participial
// insertion like "Managers, once approved, can view...") could still slip
// through uncorrected. The Semantic Coverage Engine's zero-actor
// escalation (semantic-coverage.ts) remains the backstop of last resort
// for wholesale failures; this list only reduces, not eliminates, the risk
// of a corrupted-but-non-empty actor name for the specific, common
// function-word class it enumerates.
const FUNCTION_WORD_EXCLUSIONS = [
  "also",
  "typically",
  "usually",
  "generally",
  "often",
  "sometimes",
  "currently",
  "recently",
  "now",
  "then",
  "still",
  "already",
  "always",
  "never",
  "rarely",
  "occasionally",
  "frequently",
  "regularly",
  "immediately",
  "automatically",
  "manually",
  "directly",
  "indirectly",
  "primarily",
  "mainly",
  "mostly",
  "largely",
  "simply",
  "merely",
  "just",
  "only",
  "even",
  "further",
  "additionally",
  "similarly",
  "likewise",
  "consequently",
  "therefore",
  "thus",
  "hence",
  "however",
  "nevertheless",
  "nonetheless",
  "meanwhile",
  "subsequently",
  "previously",
  "initially",
  "finally",
  "eventually",
  "ultimately",
  "quickly",
  "easily",
  "readily",
  "potentially",
  "possibly",
  "presumably",
  "apparently",
  "evidently",
  "clearly",
  "obviously",
  "certainly",
  "definitely",
  "probably",
  "likely",
  "perhaps",
  "maybe",
  "and",
  "or",
  "but",
  "nor",
];
const FUNCTION_WORD_PATTERN = FUNCTION_WORD_EXCLUSIONS.join("|");

// Common English role-suffix nouns — a small, generic, closed set of
// words that legitimately complete a two-word role/actor name (e.g.
// "Plant Managers," "Restaurant Staff," "Family Members"). Deliberately
// generic organizational-role vocabulary, not any one product domain's
// terms — the same "small, stable, purely grammatical/structural set"
// standard already applied to FUNCTION_WORD_EXCLUSIONS and
// ORGANIZATIONAL_VERBS, verified to contain zero fixture-specific nouns
// by the same anti-hardcoding meta-test that scans this file.
const ROLE_SUFFIX_WORDS = [
  "member",
  "members",
  "manager",
  "managers",
  "staff",
  "lead",
  "leads",
  "rep",
  "reps",
  "admin",
  "admins",
  "agent",
  "agents",
  "officer",
  "officers",
  "coordinator",
  "coordinators",
  "associate",
  "associates",
  "representative",
  "representatives",
  "supervisor",
  "supervisors",
  "technician",
  "technicians",
  "specialist",
  "specialists",
  "assistant",
  "assistants",
  "professional",
  "professionals",
  "owner",
  "owners",
  "operator",
  "operators",
  "provider",
  "providers",
];
// Round 6 independent review (post-D-0073) Finding, CRITICAL DEFECT: this
// pattern was built directly from ROLE_SUFFIX_WORDS (all-lowercase) and
// matched case-sensitively, so a compound role name written in the
// common "Title Case Both Words" convention ("Insurance Agents,"
// "Escalation Leads," "Product Owners") was invisible — only the
// lowercase-second-word convention ("Insurance agents") matched. Every
// existing corpus fixture happened to use the lowercase-second-word form,
// so this shipped undetected through 5 prior review rounds. This is the
// same "capitalized subject, second word not recognized" failure shape as
// rounds 1-4, just against a case difference instead of a vocabulary gap
// — fixed the same way: widen the match to accept either the word's given
// lowercase form or its capitalized form (first letter only, matching how
// English title-cases a common noun), never full-uppercase or a second
// growing list, so a real proper noun elsewhere in the sentence is not
// accidentally swept in.
const ROLE_SUFFIX_PATTERN = ROLE_SUFFIX_WORDS.map(
  (word) => `[${word[0]!.toUpperCase()}${word[0]}]${word.slice(1)}`,
).join("|");

// Round 4 independent review (post-D-0070) Finding R4-1, and its explicit
// architectural conclusion: rounds 1-3 each closed the optional-second-
// word capture's greediness bug for exactly one more word class (copulas,
// then modals/organizational verbs, then ~70 enumerated adverbs/
// conjunctions) — round 4 found a fourth instance in under a minute
// ("Managers really can...", "Owners genuinely can...") and concluded
// that a NEGATIVE-lookahead blocklist against English's open-ended
// adverb class can never converge; each additional round of word-by-word
// blocklist patching had demonstrably negative return. Per round 4's own
// two suggested structural alternatives, this combines both: the second
// word of a two-word actor name is now matched by a POSITIVE allowlist
// (ROLE_SUFFIX_WORDS above) instead of a negative blocklist — an adverb
// can never be positively mistaken for a role-suffix noun, because the
// two lists share no words, so this closes the entire corruption bug
// class structurally (no blocklist to keep growing) while still
// recovering real coverage for common compound names ("Plant Managers,"
// "Restaurant Staff") that a single-word-only capture would have lost
// entirely. FUNCTION_WORD_EXCLUSIONS/FUNCTION_WORD_PATTERN remains, used
// only for the separate "skip one filler word between subject and verb"
// case below (a different mechanism, unaffected by this change).
//
// Two ways a sentence introduces a genuine actor, both purely structural
// (grammar, never vocabulary): (1) a capitalized subject followed by a
// true capability/possession modal ("can", "have", "may", "will") — "is"/
// "are"/"include[s]" are deliberately excluded, since those usually
// introduce a definitional sentence about the product itself (e.g. a
// product-name sentence like "<Product> is a ..." or "The app includes
// ..."), not an actor performing an action; or (2) a capitalized subject
// immediately followed by one of the same generic organizational verbs
// (in any inflection) used directly, present or past tense, with no modal
// — "Managers assign tasks," "Employees received tasks." A non-capturing
// "skip one filler word" group separately handles a function word sitting
// *between* the subject and the real modal/verb — e.g. "Drivers also can
// track deliveries."
// Round 7 independent review (post-D-0074) Finding, CRITICAL DEFECT: the
// actor's first word required `[A-Z][a-zA-Z]*` with no internal hyphen,
// so a hyphenated compound name ("On-site Technicians," "Full-time
// Staff," "Co-Managers") — an entirely ordinary way to write a job
// title — failed to match at all, producing the same false zero-actor
// hard-block as rounds 5/6's findings. Widened structurally (a hyphen
// followed by more letters, repeatable) rather than adding hyphenated
// variants to any word list.
const ACTOR_LEAD_PATTERN = new RegExp(
  `^\\s*([A-Z][a-zA-Z]*(?:-[a-zA-Z]+)*(?:\\s+(?:${ROLE_SUFFIX_PATTERN}))?)\\s+(?:(?:${FUNCTION_WORD_PATTERN})\\s+)?(?:can|have|has|may|will|${ORGANIZATIONAL_VERB_PATTERN})\\b`,
);

// Round 7 independent review (post-D-0074) Finding, CRITICAL DEFECT: a
// bulleted/dash-prefixed role list ("- Managers can create sprints...")
// — an extremely common, ordinary way to write a product description —
// failed ACTOR_LEAD_PATTERN's `^\s*[A-Z]` anchor entirely, since the
// clause literally starts with the bullet character, not a letter. A
// leading list marker (a dash/bullet character, or a numbered/lettered
// list prefix like "1." or "a)") is not part of the actor's name and is
// stripped before matching, the same way whitespace already is.
const LEADING_LIST_MARKER_PATTERN = /^[-*•]\s+|^\d+[.)]\s+/;

const VERB_OBJECT_PATTERN = new RegExp(
  `\\b(${ORGANIZATIONAL_VERB_PATTERN})\\b\\s+([a-z][a-zA-Z\\- ]*?)(?=[,;.]|\\band\\b|\\bor\\b|$)`,
  "gi",
);

// Round 5 independent review (post-D-0072) Finding, CRITICAL DEFECT:
// ACTOR_LEAD_PATTERN is anchored with `^` and was applied to a whole
// sentence, so it only ever recognized an actor as literally the first
// word(s) of that sentence. Any ordinary leading clause ("When a request
// comes in, Employees can review it...") or a second clause joined onto
// the first ("...and Managers can approve it...") put the actor past
// position zero and made it invisible, even though the exact same
// "Capitalized-Actor can/verb" construction that already works at
// sentence-start was present later in the same sentence. This is a
// structural fix, not a lexical one: split each sentence at its clause
// boundaries — commas and the small, closed set of coordinating
// conjunctions already treated as function words elsewhere in this file
// (and/but) — and apply ACTOR_LEAD_PATTERN at the start of every
// resulting clause, not just the sentence's own start. A clause with no
// actor+modal/verb construction (e.g. "When a request comes in") simply
// produces no match, same as before.
//
// Round 7 independent review (post-D-0074) Finding, CRITICAL DEFECT: a
// semicolon joining two independent clauses ("...for later analysis;
// Managers can review them...") is not "," / "and" / "but", so it was
// not recognized as a clause boundary either, hiding the actor in the
// second clause the same way an unhandled comma/conjunction did before
// round 5. A semicolon is unambiguously a clause boundary in English
// (unlike a bare comma, which can also separate list items within one
// clause), so it is added directly rather than through any word list.
const CLAUSE_SPLIT_PATTERN = /,\s*|;\s*|\s+and\s+|\s+but\s+/;

// Round 7 independent review (post-D-0074) also found a fourth, related
// construction — a leading subordinate clause with NO comma before the
// actor ("When a new request arrives Managers can review it," vs. round
// 5's already-fixed "When a request comes in, Employees can review it").
// Deliberately NOT fixed here, unlike the three findings above — disclosed
// instead, honestly, as an accepted residual limitation (see
// execution/state.json's knownLimitations). Reason: unlike a comma,
// semicolon, hyphen, or list marker (each an unambiguous, low-risk
// structural delimiter to add), a comma-less subordinate clause has NO
// delimiter separating it from the main clause that follows — closing
// this gap would require either (a) enumerating subordinating
// conjunctions ("when," "while," "if," "because," ...) as a new clause-
// boundary class, which does not actually solve it (splitting at the
// subordinator does not find where THAT clause's own verb phrase ends and
// the main clause begins — there is still no delimiter between "arrives"
// and "Managers" above), or (b) removing ACTOR_LEAD_PATTERN's `^` anchor
// entirely and searching for the construction anywhere in a clause — which
// reintroduces a real, previously-avoided false-positive risk: an ordinary
// product-capability sentence naming the product itself as the grammatical
// subject ("<ProductName> can process X in under a minute") would then
// extract the product's own name as an actor (a product name, not a
// role), a corruption class this file's anchoring has deliberately
// avoided since round 1. Given the choice between shipping a real new
// corruption risk and disclosing a clean miss, this file ships the clean
// miss — the same "safe miss over corrupted guess" standard round 4
// established.

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitClauses(sentence: string): string[] {
  return sentence
    .split(CLAUSE_SPLIT_PATTERN)
    .map((c) => c.trim())
    .filter(Boolean);
}

function singularize(noun: string): string {
  const trimmed = noun.trim();
  if (trimmed.endsWith("ies") && trimmed.length > 4) {
    return `${trimmed.slice(0, -3)}y`;
  }
  if (trimmed.endsWith("ses") || trimmed.endsWith("xes")) {
    return trimmed.slice(0, -2);
  }
  if (trimmed.endsWith("s") && !trimmed.endsWith("ss")) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Maps a matched inflected verb ("assigns"/"assigned"/"assigning") back to its base form for display, so capability/workflow names read naturally regardless of the sentence's tense. */
function verbBaseForm(inflected: string): string {
  const lower = inflected.toLowerCase();
  return (
    ORGANIZATIONAL_VERBS.find((base) => lower === base) ??
    ORGANIZATIONAL_VERBS.find((base) => {
      const pastStem = base.endsWith("e") ? base.slice(0, -1) : base;
      const doubledConsonant = /[^aeiou]$/.test(base) && /[aeiou][^aeiou]$/.test(base.slice(-2));
      const gerundStem = doubledConsonant ? base + base.slice(-1) : base;
      return lower === `${base}s` || lower === `${pastStem}ed` || lower === `${gerundStem}ing`;
    }) ??
    lower
  );
}

function excerpt(sentence: string): string {
  return sentence.length > 200 ? `${sentence.slice(0, 197)}...` : sentence;
}

function lowConfidenceProvenance(
  kind: string,
  normalizedText: string,
  sentence: string,
): SemanticProvenance {
  return {
    requirementId: deriveRequirementId(kind, normalizedText),
    sourceExcerpt: excerpt(sentence),
    sourceType: "low_risk_inference",
    confidence: "low",
  };
}

export function extractSemanticsHeuristically(rawText: string): SemanticExtractionResult {
  const trimmed = rawText.trim();
  const sentences = splitSentences(trimmed);

  const actorNames = new Set<string>();
  const actors: SemanticActor[] = [];
  const entityNames = new Set<string>();
  const entities: SemanticEntity[] = [];
  const workflows: SemanticWorkflow[] = [];
  const capabilities: SemanticCapability[] = [];

  for (const sentence of sentences) {
    let actorName: string | null = null;
    for (const clause of splitClauses(sentence)) {
      const cleanedClause = clause.replace(LEADING_LIST_MARKER_PATTERN, "");
      const actorMatch = cleanedClause.match(ACTOR_LEAD_PATTERN);
      if (!actorMatch) continue;
      const clauseActorName = titleCase(actorMatch[1]!.trim());
      if (actorName === null) actorName = clauseActorName;
      if (!actorNames.has(clauseActorName.toLowerCase())) {
        actorNames.add(clauseActorName.toLowerCase());
        actors.push({
          name: clauseActorName,
          description: excerpt(sentence),
          goals: [],
          provenance: lowConfidenceProvenance("actor", clauseActorName, sentence),
        });
      }
    }

    const verbMatches = Array.from(sentence.matchAll(VERB_OBJECT_PATTERN));
    const stepVerbs: string[] = [];
    for (const match of verbMatches) {
      const verb = verbBaseForm(match[1]!);
      const rawObject = match[2]?.trim();
      stepVerbs.push(verb);
      if (!rawObject) continue;

      // Keep the object noun phrase short — a long tail usually means the
      // pattern over-matched into an unrelated clause, which a low-
      // confidence heuristic should decline to guess at rather than
      // fabricate a wordy "entity" name.
      const words = rawObject.split(/\s+/).filter(Boolean);
      if (words.length === 0 || words.length > 4) continue;
      const candidate = titleCase(singularize(words[words.length - 1]!));
      if (candidate.length < 3) continue;
      if (!entityNames.has(candidate.toLowerCase())) {
        entityNames.add(candidate.toLowerCase());
        entities.push({
          name: candidate,
          attributes: ["id", "status", "createdAt"],
          relationships: [],
          lifecycleStates: [],
          ownerActor: actorName,
          provenance: lowConfidenceProvenance("entity", candidate, sentence),
        });
      }

      capabilities.push({
        kind: "action",
        name: `${titleCase(verb)} ${candidate}`,
        actor: actorName,
        description: excerpt(sentence),
        provenance: lowConfidenceProvenance("capability", `${verb}-${candidate}`, sentence),
      });
    }

    if (stepVerbs.length > 0) {
      const hasRecurrence = /\brecurring\b|\bone-time\b|\bdeadline\b|\bschedule[d]?\b/i.test(
        sentence,
      );
      const workflowName = actorName
        ? `${actorName}: ${titleCase(stepVerbs[0]!)}`
        : titleCase(stepVerbs[0]!);
      workflows.push({
        name: workflowName,
        actor: actorName,
        steps: [sentence],
        trigger: null,
        recurrence: hasRecurrence ? "mentioned — exact schedule unresolved" : null,
        hasDeadline: /\bdeadline\b/i.test(sentence),
        provenance: lowConfidenceProvenance("workflow", workflowName, sentence),
      });
    }
  }

  const targetUsers = actors.length > 0 ? actors.map((a) => a.name) : [];

  const unresolvedQuestions: string[] = [];
  if (targetUsers.length === 0) {
    unresolvedQuestions.push("Who is the primary target customer for this product?");
  }
  if (actors.length < 2) {
    unresolvedQuestions.push(
      "Does this product need more than one user role — and if only one was detected, is that genuinely all that's needed?",
    );
  }

  return {
    purpose: sentences[0] ?? trimmed,
    targetUsers,
    actors,
    entities,
    workflows,
    capabilities,
    permissions: [],
    businessRules: [],
    monetization: [],
    integrations: [],
    constraints: [],
    unresolvedQuestions,
    consequentialDecisions: [],
    unsupportedRequirements: [],
    usage: null,
  };
}
