import "server-only";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import { getAiUsageSummary } from "@/lib/observability/ai-usage";
import type { AiUsageSummary } from "@/lib/observability/ai-usage";
import type { BillingState, PlanKey } from "@/generated/prisma/client";

export type BusinessAnalyticsSnapshot = {
  planKey: PlanKey;
  billingState: BillingState;
  projectCount: number;
  aiUsage: AiUsageSummary;
  auditLogEntryCount: number;
};

/**
 * Master Spec §61 "product and business analytics" — the business half:
 * Pocket Studio's own real relationship with this organization (their
 * subscription state, real project count, real AI spend via P3-11's
 * getAiUsageSummary, real audit activity volume). Requires ADMIN, the
 * same elevated bar already established for viewing audit logs and AI
 * cost (P3-11) — this snapshot exposes the same category of sensitive
 * operational detail.
 */
export async function getBusinessAnalyticsSnapshot(
  actorUserId: string,
  organizationId: string,
): Promise<BusinessAnalyticsSnapshot> {
  await requireOrganizationMembership(actorUserId, organizationId, "ADMIN");

  const [subscription, projectCount, aiUsage, auditLogEntryCount] = await Promise.all([
    db.organizationSubscription.findUnique({ where: { organizationId } }),
    db.project.count({ where: { organizationId } }),
    getAiUsageSummary(actorUserId, organizationId),
    db.auditLogEntry.count({ where: { organizationId } }),
  ]);

  return {
    planKey: subscription?.planKey ?? "FREE_EXPLORE",
    billingState: subscription?.billingState ?? "TRIALING",
    projectCount,
    aiUsage,
    auditLogEntryCount,
  };
}
