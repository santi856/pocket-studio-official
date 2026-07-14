import "server-only";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import type { AiUsageEvent } from "@/generated/prisma/client";

function estimateCostCents(
  provider: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (provider !== "anthropic") {
    return null;
  }
  const env = getServerEnv();
  const { AI_COST_PER_1K_INPUT_TOKENS_CENTS, AI_COST_PER_1K_OUTPUT_TOKENS_CENTS } = env;
  if (
    AI_COST_PER_1K_INPUT_TOKENS_CENTS === undefined ||
    AI_COST_PER_1K_OUTPUT_TOKENS_CENTS === undefined
  ) {
    return null;
  }
  const cost =
    (inputTokens / 1000) * AI_COST_PER_1K_INPUT_TOKENS_CENTS +
    (outputTokens / 1000) * AI_COST_PER_1K_OUTPUT_TOKENS_CENTS;
  return Math.round(cost);
}

/**
 * Master Spec §61 "cost tracking". Records a real AI provider call's
 * actual token usage — never called at all when usage is null (mock
 * mode made no real call, so there is nothing real to record; recording
 * a fabricated zero-cost row would misrepresent mock traffic as billed
 * usage). estimatedCostCents is only populated when an operator has
 * configured a real, current per-token rate — see estimateCostCents.
 */
export async function recordAiUsageEvent(input: {
  organizationId?: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<AiUsageEvent> {
  return db.aiUsageEvent.create({
    data: {
      organizationId: input.organizationId,
      provider: input.provider,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostCents: estimateCostCents(input.provider, input.inputTokens, input.outputTokens),
    },
  });
}

export type AiUsageSummary = {
  totalInputTokens: number;
  totalOutputTokens: number;
  /** null if no event in the window has a computed cost (rate not configured). */
  totalEstimatedCostCents: number | null;
  eventCount: number;
};

export async function getAiUsageSummary(
  actorUserId: string,
  organizationId: string,
): Promise<AiUsageSummary> {
  await requireOrganizationMembership(actorUserId, organizationId, "ADMIN");

  const events = await db.aiUsageEvent.findMany({ where: { organizationId } });

  const costedEvents = events.filter((event) => event.estimatedCostCents !== null);

  return {
    totalInputTokens: events.reduce((sum, event) => sum + event.inputTokens, 0),
    totalOutputTokens: events.reduce((sum, event) => sum + event.outputTokens, 0),
    totalEstimatedCostCents:
      costedEvents.length > 0
        ? costedEvents.reduce((sum, event) => sum + (event.estimatedCostCents ?? 0), 0)
        : null,
    eventCount: events.length,
  };
}
