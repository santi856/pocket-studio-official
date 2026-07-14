import "server-only";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenancy/platform-admin";
import type {
  BillingState,
  IncidentStatus,
  Organization,
  OrganizationSubscription,
} from "@/generated/prisma/client";

/**
 * Master Spec §61 "internal administrative operations" — real,
 * cross-tenant visibility for support/ops, gated on real platform-admin
 * access (P3-13). Deliberately does not call requireOrganizationMembership
 * for any single organization: a platform admin's authority to see every
 * organization is not derived from being a member of any of them.
 */
export async function listAllOrganizations(
  actorUserId: string,
): Promise<Array<Organization & { subscription: OrganizationSubscription | null }>> {
  await requirePlatformAdmin(actorUserId);

  return db.organization.findMany({
    include: { subscription: true },
    orderBy: { createdAt: "desc" },
  });
}

export type PlatformOverview = {
  organizationCount: number;
  projectCount: number;
  userCount: number;
  organizationCountByBillingState: Partial<Record<BillingState, number>>;
  incidentCountByStatus: Partial<Record<IncidentStatus, number>>;
  totalAiInputTokens: number;
  totalAiOutputTokens: number;
  /** null unless at least one AiUsageEvent has a computed cost (an operator configured a real rate). */
  totalAiEstimatedCostCents: number | null;
};

export async function getPlatformOverview(actorUserId: string): Promise<PlatformOverview> {
  await requirePlatformAdmin(actorUserId);

  const [
    organizationCount,
    projectCount,
    userCount,
    subscriptionsByState,
    incidentsByStatus,
    aiUsageEvents,
  ] = await Promise.all([
    db.organization.count(),
    db.project.count(),
    db.user.count(),
    db.organizationSubscription.groupBy({ by: ["billingState"], _count: { _all: true } }),
    db.incidentReport.groupBy({ by: ["status"], _count: { _all: true } }),
    db.aiUsageEvent.findMany({
      select: { inputTokens: true, outputTokens: true, estimatedCostCents: true },
    }),
  ]);

  const organizationCountByBillingState: Partial<Record<BillingState, number>> = {};
  for (const group of subscriptionsByState) {
    organizationCountByBillingState[group.billingState] = group._count._all;
  }

  const incidentCountByStatus: Partial<Record<IncidentStatus, number>> = {};
  for (const group of incidentsByStatus) {
    incidentCountByStatus[group.status] = group._count._all;
  }

  const costedEvents = aiUsageEvents.filter((event) => event.estimatedCostCents !== null);

  return {
    organizationCount,
    projectCount,
    userCount,
    organizationCountByBillingState,
    incidentCountByStatus,
    totalAiInputTokens: aiUsageEvents.reduce((sum, event) => sum + event.inputTokens, 0),
    totalAiOutputTokens: aiUsageEvents.reduce((sum, event) => sum + event.outputTokens, 0),
    totalAiEstimatedCostCents:
      costedEvents.length > 0
        ? costedEvents.reduce((sum, event) => sum + (event.estimatedCostCents ?? 0), 0)
        : null,
  };
}
