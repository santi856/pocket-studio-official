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
 * One interface, swappable implementations. Phase 1 ships only
 * MockAIProvider (deterministic, no external calls). Real provider
 * connections are Phase 3 scope (Master Spec §61) — AnthropicAIProvider
 * exists as an architectural placeholder so call sites never need to
 * change when it is implemented, per Execution Protocol §8 ("never block
 * architecture on missing credentials").
 */
export interface AIProvider {
  readonly name: "mock" | "anthropic";
  resolveIntent(input: ResolveIntentInput): Promise<ResolvedIntent>;
}

export class ProviderNotImplementedError extends Error {
  constructor(providerName: string) {
    super(
      `AI provider "${providerName}" is not yet implemented. Real provider connections are ` +
        `Phase 3 scope (Master Spec §61). Set AI_PROVIDER=mock to run without a live provider.`,
    );
    this.name = "ProviderNotImplementedError";
  }
}
