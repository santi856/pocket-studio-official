import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestProductState } from "@/lib/product/product-state";
import { getAIProvider } from "@/lib/ai/get-provider";
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
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const existingState = await getLatestProductState(actorUserId, projectId);

  const provider = getAIProvider();
  return provider.resolveIntent({
    rawText,
    hasExistingProductState: existingState !== null,
  });
}
