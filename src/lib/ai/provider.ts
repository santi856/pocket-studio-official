import "server-only";

export type ResolveIntentInput = {
  rawText: string;
  hasExistingProductState: boolean;
};

export type ResolvedIntentType = "describe_idea" | "edit_request" | "unclear";

export type ResolvedIntent = {
  type: ResolvedIntentType;
  /** Not a paraphrase in mock mode — see MockAIProvider for why. */
  summary: string;
  confidence: "high" | "medium" | "low";
  /**
   * Real token counts from a live provider call, for cost tracking
   * (Master Spec §61). null in mock mode — no real API call was made, so
   * there is no real usage to report; never a fabricated placeholder.
   */
  usage: { inputTokens: number; outputTokens: number } | null;
};

export type SemanticExtractionInput = {
  rawText: string;
  /** Raw text of any prior semantic model version, for edit requests — never re-extracted from scratch when the customer is refining, only when it's a first-time idea. */
  priorRawText: string | null;
};

/**
 * Every material item's source-of-truth tag. Deliberately smaller than a
 * free-form confidence score — a human (or the deterministic Semantic
 * Coverage Engine) needs to be able to tell "the customer said this" apart
 * from "the model guessed this" without reading prose.
 */
export type SemanticSourceType =
  | "customer_explicit"
  | "customer_confirmed"
  | "low_risk_inference"
  | "recommendation"
  | "unresolved"
  | "consequential_decision"
  | "system_constraint";

export type SemanticProvenance = {
  /** Stable across regenerations of the same source text — see requirement-id.ts. */
  requirementId: string;
  /** Bounded excerpt of the raw text this item was derived from — never the full text repeated per item. */
  sourceExcerpt: string;
  sourceType: SemanticSourceType;
  confidence: "high" | "medium" | "low";
};

export type SemanticActor = {
  name: string;
  description: string;
  goals: string[];
  provenance: SemanticProvenance;
};

export type SemanticEntity = {
  name: string;
  attributes: string[];
  relationships: string[];
  lifecycleStates: string[];
  ownerActor: string | null;
  provenance: SemanticProvenance;
};

export type SemanticWorkflow = {
  name: string;
  actor: string | null;
  steps: string[];
  trigger: string | null;
  recurrence: string | null;
  hasDeadline: boolean;
  provenance: SemanticProvenance;
};

export type SemanticCapabilityKind =
  | "action"
  | "notification"
  | "dashboard"
  | "report"
  | "search"
  | "filter"
  | "sort"
  | "collaboration"
  | "administration";

export type SemanticCapability = {
  kind: SemanticCapabilityKind;
  name: string;
  actor: string | null;
  description: string;
  provenance: SemanticProvenance;
};

export type SemanticPermission = {
  actor: string;
  subject: string;
  access: "full" | "read_only" | "none" | "conditional";
  notes: string | null;
  provenance: SemanticProvenance;
};

export type SemanticStatement = {
  statement: string;
  provenance: SemanticProvenance;
};

/**
 * The Semantic Product Compiler's structured extraction result (D-0065,
 * execution/architecture/SEMANTIC_PRODUCT_COMPILER_REPORT.md §11). One
 * schema shared by both providers — AnthropicAIProvider populates it via a
 * real, forced-tool-use model call; MockAIProvider populates it via an
 * honestly-labeled, low-confidence deterministic fallback. Every material
 * item carries its own SemanticProvenance; nothing here is presented as
 * fact without a source and a confidence level. "Calculations" and
 * "visibility" are folded into businessRules/permissions.notes rather than
 * given their own top-level arrays — a deliberate simplification (see the
 * report's §10 "prefer the smallest architecture").
 */
export type SemanticExtractionResult = {
  purpose: string;
  targetUsers: string[];
  actors: SemanticActor[];
  entities: SemanticEntity[];
  workflows: SemanticWorkflow[];
  capabilities: SemanticCapability[];
  permissions: SemanticPermission[];
  businessRules: SemanticStatement[];
  monetization: SemanticStatement[];
  integrations: SemanticStatement[];
  constraints: SemanticStatement[];
  unresolvedQuestions: string[];
  consequentialDecisions: string[];
  unsupportedRequirements: string[];
  /**
   * The mode signal: non-null only when a real provider call actually
   * succeeded. AnthropicAIProvider.extractProductSemantics falls back to
   * the same deterministic heuristic MockAIProvider uses whenever a live
   * call fails after its retry budget — that fallback always returns
   * `usage: null`, exactly like MockAIProvider — so callers (semantic-
   * model.ts) can honestly set generationMetadata.mode to
   * "deterministic_fallback" purely by checking `usage === null`, without
   * needing a second signal threaded through separately.
   */
  usage: { inputTokens: number; outputTokens: number } | null;
};

/**
 * One interface, swappable implementations. MockAIProvider is
 * deterministic and makes no external calls; AnthropicAIProvider is a real
 * server-side connection to Anthropic's API (Master Spec §61, Phase 3).
 * Selected via AI_PROVIDER (src/lib/env.ts) — call sites never need to
 * change based on which one is active.
 */
export interface AIProvider {
  readonly name: "mock" | "anthropic";
  resolveIntent(input: ResolveIntentInput): Promise<ResolvedIntent>;
  extractProductSemantics(input: SemanticExtractionInput): Promise<SemanticExtractionResult>;
}
