import "server-only";
import type { AIProvider, ResolveIntentInput, ResolvedIntent } from "@/lib/ai/provider";

const MIN_MEANINGFUL_TEXT_LENGTH = 10;

/**
 * Deterministic, rule-based, no external calls. This is not a substitute
 * for real language understanding — it exists so the full Phase 1 customer
 * flow (Master Spec §51) works end to end without live AI credentials, and
 * so Truth Status can honestly report "mock" rather than pretending to be
 * real intelligence. `summary` intentionally echoes the input rather than
 * paraphrasing it: a mock provider that appeared to understand the text
 * would misrepresent what Phase 1 actually does.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;

  async resolveIntent(input: ResolveIntentInput): Promise<ResolvedIntent> {
    const trimmed = input.rawText.trim();

    if (trimmed.length < MIN_MEANINGFUL_TEXT_LENGTH) {
      return {
        type: "unclear",
        summary: trimmed,
        confidence: "low",
        usage: null,
      };
    }

    return {
      type: input.hasExistingProductState ? "edit_request" : "describe_idea",
      summary: trimmed,
      confidence: "high",
      usage: null,
    };
  }
}
