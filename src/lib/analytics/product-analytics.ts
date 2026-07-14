import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { listLatestTruthStatuses } from "@/lib/product/truth-status";

export type ProductAnalyticsSnapshot = {
  generatedAppUserCount: number;
  generatedRecordCountByModelKey: Record<string, number>;
  payments: {
    succeeded: number;
    failed: number;
    pending: number;
    totalSucceededAmountCents: number;
  };
  deploymentsByEnvironment: Record<
    string,
    { succeeded: number; failed: number; rolledBack: number }
  >;
  latestStoreSubmissionStatusByPlatform: Record<string, string | null>;
  truthStatusImplementedFraction: number | null;
};

/**
 * Master Spec §61 "product and business analytics" — the product half:
 * real counts aggregated from what earlier Phase 3 units already record
 * (GeneratedAppUser/GeneratedRecord from Phase 2, GeneratedAppPayment
 * P3-06, Deployment P3-08, StoreSubmission P3-09, TruthStatusEntry
 * throughout). No new tracking mechanism — this reads existing real
 * facts, never estimates or infers a number that was not actually
 * recorded.
 */
export async function getProductAnalyticsSnapshot(
  actorUserId: string,
  projectId: string,
): Promise<ProductAnalyticsSnapshot> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [
    generatedAppUserCount,
    generatedRecords,
    payments,
    deployments,
    storeSubmissions,
    truthStatuses,
  ] = await Promise.all([
    db.generatedAppUser.count({ where: { projectId } }),
    db.generatedRecord.groupBy({ by: ["modelKey"], where: { projectId }, _count: { _all: true } }),
    db.generatedAppPayment.findMany({
      where: { projectId },
      select: { status: true, amountCents: true },
    }),
    db.deployment.findMany({ where: { projectId }, select: { environment: true, status: true } }),
    db.storeSubmission.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { platform: true, status: true },
    }),
    listLatestTruthStatuses(actorUserId, projectId),
  ]);

  const generatedRecordCountByModelKey: Record<string, number> = {};
  for (const group of generatedRecords) {
    generatedRecordCountByModelKey[group.modelKey] = group._count._all;
  }

  const paymentSummary = payments.reduce(
    (acc, payment) => {
      if (payment.status === "SUCCEEDED") {
        acc.succeeded += 1;
        acc.totalSucceededAmountCents += payment.amountCents;
      } else if (payment.status === "FAILED") {
        acc.failed += 1;
      } else {
        acc.pending += 1;
      }
      return acc;
    },
    { succeeded: 0, failed: 0, pending: 0, totalSucceededAmountCents: 0 },
  );

  const deploymentsByEnvironment: ProductAnalyticsSnapshot["deploymentsByEnvironment"] = {};
  for (const deployment of deployments) {
    const bucket = (deploymentsByEnvironment[deployment.environment] ??= {
      succeeded: 0,
      failed: 0,
      rolledBack: 0,
    });
    if (deployment.status === "SUCCEEDED") bucket.succeeded += 1;
    else if (deployment.status === "FAILED") bucket.failed += 1;
    else bucket.rolledBack += 1;
  }

  const latestStoreSubmissionStatusByPlatform: Record<string, string | null> = {
    IOS: null,
    ANDROID: null,
  };
  for (const submission of storeSubmissions) {
    if (latestStoreSubmissionStatusByPlatform[submission.platform] === null) {
      latestStoreSubmissionStatusByPlatform[submission.platform] = submission.status;
    }
  }

  const truthStatusImplementedFraction =
    truthStatuses.length > 0
      ? truthStatuses.filter((status) => status.status === "IMPLEMENTED").length /
        truthStatuses.length
      : null;

  return {
    generatedAppUserCount,
    generatedRecordCountByModelKey,
    payments: paymentSummary,
    deploymentsByEnvironment,
    latestStoreSubmissionStatusByPlatform,
    truthStatusImplementedFraction,
  };
}
