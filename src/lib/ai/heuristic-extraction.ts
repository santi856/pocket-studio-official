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

// Only true capability/possession modals ("can", "have", "may", "will")
// indicate a genuine actor — "is"/"are"/"include[s]" usually introduce a
// definitional sentence about the product itself (e.g. a product-name
// sentence like "<Product> is a ..." or "The app includes ..."), not an
// actor performing an action, so those are deliberately excluded to avoid
// mistaking the product's own name for an actor.
const ACTOR_LEAD_PATTERN = new RegExp(
  `^\\s*([A-Z][a-zA-Z]*(?:\\s+[a-z]+)?)\\s+(?:can|have|has|may|will)\\b`,
);

const VERB_OBJECT_PATTERN = new RegExp(
  `\\b(${ORGANIZATIONAL_VERBS.join("|")})\\b\\s+([a-z][a-zA-Z\\- ]*?)(?=[,;.]|\\band\\b|\\bor\\b|$)`,
  "gi",
);

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
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
    const actorMatch = sentence.match(ACTOR_LEAD_PATTERN);
    let actorName: string | null = null;
    if (actorMatch) {
      actorName = titleCase(actorMatch[1]!.trim());
      if (!actorNames.has(actorName.toLowerCase())) {
        actorNames.add(actorName.toLowerCase());
        actors.push({
          name: actorName,
          description: excerpt(sentence),
          goals: [],
          provenance: lowConfidenceProvenance("actor", actorName, sentence),
        });
      }
    }

    const verbMatches = Array.from(sentence.matchAll(VERB_OBJECT_PATTERN));
    const stepVerbs: string[] = [];
    for (const match of verbMatches) {
      const verb = match[1]!.toLowerCase();
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
