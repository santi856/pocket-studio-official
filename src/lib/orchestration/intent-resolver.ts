import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestProductState } from "@/lib/product/product-state";
import { getAIProvider } from "@/lib/ai/get-provider";
import { recordAiUsageEvent } from "@/lib/observability/ai-usage";
import { beginGeneration } from "@/lib/ai/generation-limits";
import type { ResolvedIntent } from "@/lib/ai/provider";

/**
 * "Resolve Intent" — the second step of the Orchestration Contract (Master
 * Spec §13). Loads Canonical Product State first (per the required change
 * flow) so the resolver can distinguish a first-time idea description from
 * a follow-up edit request on an existing project.
 */
export async function resolveIntent(
  actorUserId: string,
  projectId: string,
  rawText: string,
): Promise<ResolvedIntent> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const existingState = await getLatestProductState(actorUserId, projectId);

  const provider = getAIProvider();
  // Production-safe AI usage controls (monthly quota/spend caps,
  // concurrency limit) — the lease must be held for the exact duration of
  // the real provider call, released whether it succeeds or throws.
  const lease = await beginGeneration(project.organizationId);
  let result: ResolvedIntent;
  try {
    result = await provider.resolveIntent({
      rawText,
      hasExistingProductState: existingState !== null,
    });
  } finally {
    await lease.release();
  }

  // Master Spec §61 "cost tracking" — only a real provider call has real
  // usage to record; mock mode's null usage is never recorded as a
  // fabricated zero-cost event.
  if (result.usage) {
    await recordAiUsageEvent({
      organizationId: project.organizationId,
      provider: provider.name,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
  }

  return result;
}
