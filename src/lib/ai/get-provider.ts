import "server-only";
import { getServerEnv } from "@/lib/env";
import { MockAIProvider } from "@/lib/ai/mock-provider";
import { AnthropicAIProvider } from "@/lib/ai/anthropic-provider";
import type { AIProvider } from "@/lib/ai/provider";

let cachedProvider: AIProvider | undefined;

export function getAIProvider(): AIProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const env = getServerEnv();
  cachedProvider =
    env.AI_PROVIDER === "anthropic" ? new AnthropicAIProvider() : new MockAIProvider();
  return cachedProvider;
}
