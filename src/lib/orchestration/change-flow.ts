import "server-only";
import { resolveIntent } from "@/lib/orchestration/intent-resolver";
import { analyzeImpact } from "@/lib/orchestration/impact-analysis";
import { recordDecision } from "@/lib/product/decisions";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import type { ProductIntelligenceResult } from "@/lib/orchestration/product-intelligence";
import type { ResolvedIntent } from "@/lib/ai/provider";
import type { ImpactAnalysisResult } from "@/lib/orchestration/impact-analysis";
import type { Decision } from "@/generated/prisma/client";

export type ChangeFlowResult = {
  intent: ResolvedIntent;
  impact: ImpactAnalysisResult;
  decision: Decision;
  /** Only present when intent.type === "describe_idea" — see Master Spec §51. */
  productIntelligence?: ProductIntelligenceResult;
};

/**
 * Foundation for the Orchestration Contract's required change flow (Master
 * Spec §13):
 *
 *   User Intent → Load Canonical Product State → Resolve Intent →
 *   Determine Feasibility → Analyze Product and Business Impact →
 *   Select Required Specialists → Generate Structured Proposals →
 *   Detect and Resolve Conflicts → Apply Disclosure and Approval Rules →
 *   Create Validated Change Set → Update Product State Atomically →
 *   Regenerate Affected Artifacts → Validate and Test → Create Evidence →
 *   Create Version → Update Truth Status → Respond Simply
 *
 * A first-time idea (`describe_idea`) runs Feasibility and Generate
 * Structured Proposals via `generateProductIntelligence`, which itself
 * updates Product State atomically and creates a version — Phase 1's
 * customer flow (§51) never requires an edit, so `edit_request` intents
 * only reach the disclosure/approval decision for now; full conversational
 * editing with impact-aware regeneration is Phase 2 scope (§55, §57).
 * Truth Status (P1-07) will extend this function rather than duplicate it.
 */
export async function beginChangeFlow(
  actorUserId: string,
  projectId: string,
  rawText: string,
): Promise<ChangeFlowResult> {
  const intent = await resolveIntent(actorUserId, projectId, rawText);
  const impact = analyzeImpact(rawText);

  const disclosureTier = impact.consequential
    ? "CONSEQUENTIAL"
    : impact.categories.length > 0
      ? "IMPORTANT"
      : "ROUTINE";

  const decision = await recordDecision(actorUserId, projectId, {
    source: "orchestration.change-flow",
    summary:
      intent.type === "describe_idea"
        ? "New product idea submitted."
        : intent.type === "edit_request"
          ? "Change requested against an existing project."
          : "Submission was too short to classify with confidence.",
    disclosureTier,
    reason: impact.rationale.join("; ") || "No impact-category keywords matched.",
    impact: { categories: impact.categories, consequential: impact.consequential },
  });

  const productIntelligence =
    intent.type === "describe_idea"
      ? await generateProductIntelligence(actorUserId, projectId, rawText)
      : undefined;

  return { intent, impact, decision, productIntelligence };
}
