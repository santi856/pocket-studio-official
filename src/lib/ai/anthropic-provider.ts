import "server-only";
import { ProviderNotImplementedError } from "@/lib/ai/provider";
import type { AIProvider, ResolveIntentInput, ResolvedIntent } from "@/lib/ai/provider";

/**
 * Architectural placeholder. Master Spec §61 assigns "real server-side AI
 * provider connections" to Phase 3 — implementing this now would be scope
 * creep ahead of the phase that owns it. The interface exists today so
 * nothing calling AIProvider has to change when this is implemented.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly name = "anthropic" as const;

  async resolveIntent(_input: ResolveIntentInput): Promise<ResolvedIntent> {
    throw new ProviderNotImplementedError(this.name);
  }
}
