import "server-only";
import { resolveIntent } from "@/lib/orchestration/intent-resolver";
import {
  analyzeImpact,
  analyzeGraphImpact,
  describeImpactCoverage,
} from "@/lib/orchestration/impact-analysis";
import { getServerEnv } from "@/lib/env";
import { recordDecision, respondToDecision } from "@/lib/product/decisions";
import { addProductMemoryEntry } from "@/lib/product/product-memory";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import {
  applyChangeSet,
  createChangeSet,
  getChangeSetByDecisionId,
  rejectChangeSet,
} from "@/lib/orchestration/change-set";
import type { ProductIntelligenceResult } from "@/lib/orchestration/product-intelligence";
import type { ResolvedIntent } from "@/lib/ai/provider";
import type { ImpactAnalysisResult } from "@/lib/orchestration/impact-analysis";
import type { ChangeSet, Decision, Prisma } from "@/generated/prisma/client";

/**
 * Stage 3 (D-0081, STAGE_2_ARCHITECTURE_PROPOSAL.md Section 13.2 workflow
 * step 10): "the Memory-Update stage P3's own docstring already named but
 * never wired" — wired here for the first time, for every real applied
 * edit (not only the CONSEQUENTIAL-approval path the proposal's own
 * example walks through), since an applied change is an applied change
 * regardless of which approval path reached it. Uses `changeSetId`/
 * `decisionId` rather than the example's illustrative `knowledgeNodeId` —
 * a real graph node is only resolvable when IMPACT_ANALYSIS_MODE=graph
 * *and* the edit's target happens to be unambiguous (see beginChangeFlow's
 * own graph-impact enrichment above), so it is not a value this function
 * can honestly claim to have in the general case; the change set and
 * decision ids are always real and are themselves a direct, traceable
 * link back to exactly what changed and why.
 */
async function recordChangeHistory(
  actorUserId: string,
  projectId: string,
  changeSet: ChangeSet,
): Promise<void> {
  await addProductMemoryEntry(actorUserId, projectId, {
    type: "HISTORY",
    content: `Change requested: "${changeSet.sourceText}". ${changeSet.resultSummary ?? "Applied."}`,
    metadata: { changeSetId: changeSet.id, decisionId: changeSet.decisionId },
  });
}

export type ChangeFlowResult = {
  intent: ResolvedIntent;
  impact: ImpactAnalysisResult;
  decision: Decision;
  /** Only present when intent.type === "describe_idea" — see Master Spec §51. */
  productIntelligence?: ProductIntelligenceResult;
  /** Only present when intent.type === "edit_request" — see Master Spec §27, §57. */
  changeSet?: ChangeSet;
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
 * updates Product State atomically and creates a version. An `edit_request`
 * (Master Spec §27, §57) generates a structured Change Set (P2-08) in
 * addition to the disclosure/approval decision every intent already
 * receives — and, when the governing decision does not require explicit
 * approval (ROUTINE/IMPORTANT, not CONSEQUENTIAL), applies it immediately.
 * A CONSEQUENTIAL edit's Change Set stays `PENDING` until
 * `respondToChangeSetDecision` records an approval — never silently
 * applied ahead of it.
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

  // Stage 3 (D-0081/D-0082): disclosureTier stays keyword-based above,
  // unchanged, regardless of IMPACT_ANALYSIS_MODE — GraphImpactAnalysisResult
  // has no "consequential" signal yet. In "graph" mode, for edit requests
  // only, the Decision's impact content is additionally enriched with real
  // graph-traversal data when the graph actually resolves the target;
  // otherwise (default "keyword" mode, non-edit intents, or an unresolvable
  // target) behavior is identical to before this stage.
  let impactRecord: Prisma.InputJsonValue = {
    categories: impact.categories,
    consequential: impact.consequential,
  };

  if (getServerEnv().IMPACT_ANALYSIS_MODE === "graph" && intent.type === "edit_request") {
    const graphImpact = await analyzeGraphImpact(actorUserId, projectId, {
      changeTargetLabel: rawText,
    });
    if (!graphImpact.missingGraphCoverage) {
      impactRecord = {
        categories: impact.categories,
        consequential: impact.consequential,
        graph: {
          coverage: describeImpactCoverage(graphImpact),
          directlyAffected: graphImpact.directlyAffected.map((n) => n.label),
          transitivelyAffected: graphImpact.transitivelyAffected.map((n) => n.label),
          recommendedExecutionOrder: graphImpact.recommendedExecutionOrder,
          cyclicDependencyWarning: graphImpact.cyclicDependencyWarning,
        },
      };
    }
  }

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
    impact: impactRecord,
  });

  const productIntelligence =
    intent.type === "describe_idea"
      ? await generateProductIntelligence(actorUserId, projectId, rawText)
      : undefined;

  let changeSet: ChangeSet | undefined;
  if (intent.type === "edit_request") {
    changeSet = await createChangeSet(actorUserId, projectId, { decisionId: decision.id, rawText });
    if (decision.approvalStatus !== "PENDING_APPROVAL") {
      changeSet = await applyChangeSet(actorUserId, projectId, changeSet.id);
      await recordChangeHistory(actorUserId, projectId, changeSet);
    }
  }

  return { intent, impact, decision, productIntelligence, changeSet };
}

/**
 * Wraps `respondToDecision` so a decision governing a Change Set drives it
 * through the same apply/reject lifecycle on approval — a plain decision
 * with no linked Change Set (e.g. from `describe_idea`) behaves exactly as
 * `respondToDecision` alone always has.
 */
export async function respondToChangeSetDecision(
  actorUserId: string,
  projectId: string,
  decisionId: string,
  input: { approve: boolean; customerResponse?: string },
): Promise<Decision> {
  const decision = await respondToDecision(actorUserId, projectId, decisionId, input);

  const changeSet = await getChangeSetByDecisionId(actorUserId, projectId, decisionId);
  if (changeSet && changeSet.status === "PENDING") {
    if (input.approve) {
      const appliedChangeSet = await applyChangeSet(actorUserId, projectId, changeSet.id);
      await recordChangeHistory(actorUserId, projectId, appliedChangeSet);
    } else {
      await rejectChangeSet(actorUserId, projectId, changeSet.id);
    }
  }

  return decision;
}
