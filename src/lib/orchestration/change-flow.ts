import "server-only";
import { resolveIntent } from "@/lib/orchestration/intent-resolver";
import { analyzeImpact } from "@/lib/orchestration/impact-analysis";
import { recordDecision } from "@/lib/product/decisions";
import type { ResolvedIntent } from "@/lib/ai/provider";
import type { ImpactAnalysisResult } from "@/lib/orchestration/impact-analysis";
import type { Decision } from "@/generated/prisma/client";

export type ChangeFlowResult = {
  intent: ResolvedIntent;
  impact: ImpactAnalysisResult;
  decision: Decision;
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
 * Phase 1 implements the steps up through "Apply Disclosure and Approval
 * Rules": intent resolution (which itself loads Product State) and impact
 * analysis feed a recorded Decision at the correct disclosure tier. The
 * remaining steps have real content only once later units exist —
 * Feasibility (P1-05), structured proposals / Product Intelligence
 * (P1-06), and Truth Status (P1-07) — and will extend this function
 * rather than duplicate the flow.
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

  return { intent, impact, decision };
}
