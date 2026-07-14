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
}
