import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { assessBusinessHealth } from "@/lib/analytics/business-health";
import { recordDecision } from "@/lib/product/decisions";
import type { Decision } from "@/generated/prisma/client";

const AGENT_SOURCE = "continuous-product-agent";

/**
 * Master Spec §61 "bounded Continuous Product Agent foundation" (§45:
 * "may recommend and prepare changes, but must not silently modify
 * production"; §46: "grounded recommendations must identify evidence,
 * confidence basis, affected metric, proposed action, tradeoff, and
 * required approval... do not autonomously change prices, refunds,
 * policies, or production behavior"). Deliberately bounded to exactly
 * that: it reuses assessBusinessHealth's deterministic, rule-based
 * findings (P3-12) — never AI-generated free text — and only ever
 * *proposes* a change through the existing Decision Ledger at the
 * CONSEQUENTIAL disclosure tier, which defaults to PENDING_APPROVAL
 * (src/lib/product/decisions.ts). It never updates approvalStatus, never
 * writes to any other model, and never runs automatically on any
 * schedule — this build has no scheduled-job infrastructure (the same
 * disclosed gap already noted for P3-04's time-based billing
 * transitions), so this is explicitly a call-it-yourself foundation, not
 * a live autonomous loop.
 */
export async function proposeContinuousProductRecommendations(
  actorUserId: string,
  projectId: string,
): Promise<Decision[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const assessment = await assessBusinessHealth(actorUserId, projectId);
  const attentionFindings = assessment.findings.filter((finding) => finding.severity !== "OK");
  if (attentionFindings.length === 0) {
    return [];
  }

  const existingPending = await db.decision.findMany({
    where: { projectId, source: AGENT_SOURCE, approvalStatus: "PENDING_APPROVAL" },
  });
  const alreadyProposedNames = new Set(existingPending.map((decision) => decision.summary));

  const created: Decision[] = [];
  for (const finding of attentionFindings) {
    if (alreadyProposedNames.has(finding.name)) {
      continue;
    }
    const decision = await recordDecision(actorUserId, projectId, {
      source: AGENT_SOURCE,
      summary: finding.name,
      disclosureTier: "CONSEQUENTIAL",
      recommendation: finding.recommendation,
      reason: `${finding.details} Confidence: HIGH — deterministic, rule-based against real recorded platform data, not AI-generated.`,
      impact: { severity: finding.severity, metric: finding.name },
      risk:
        finding.severity === "CRITICAL"
          ? "High if left unaddressed."
          : "Moderate if left unaddressed.",
    });
    created.push(decision);
  }

  return created;
}
