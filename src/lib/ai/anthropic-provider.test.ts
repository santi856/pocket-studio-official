// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AnthropicAIProvider } from "./anthropic-provider";
import { ProviderNotImplementedError } from "./provider";

describe("AnthropicAIProvider", () => {
  it("throws ProviderNotImplementedError until Phase 3 connects a real provider", async () => {
    const provider = new AnthropicAIProvider();

    await expect(
      provider.resolveIntent({ rawText: "anything", hasExistingProductState: false }),
    ).rejects.toBeInstanceOf(ProviderNotImplementedError);
  });
});
