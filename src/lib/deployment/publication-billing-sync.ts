import "server-only";
import { db } from "@/lib/db";
import { getAccessLevel } from "@/lib/billing/access";
import { recordAuditLogEntry } from "@/lib/observability/audit-log";
import type { BillingState } from "@/generated/prisma/client";

/**
 * Called from applyBillingStateTransition (src/lib/billing/subscription.ts)
 * — the single choke point every billing state change already passes
 * through, whether member-driven (transitionBillingState) or webhook-driven
 * (applyBillingLifecycleEventFromWebhook). No actor: a billing state
 * transition, not a Pocket Studio member, is what triggers this — same
 * shape of exception as applyBillingLifecycleEventFromWebhook itself.
 *
 * When an organization's billing access leaves "full", every currently-LIVE
 * ProjectPublication for that organization is suspended — the public URL
 * stops serving. When access returns to "full", every SUSPENDED (system-
 * suspended) publication is restored to LIVE automatically. An UNPUBLISHED
 * (customer-initiated removal) publication is never touched by this
 * function, by construction — it only ever matches rows whose status is
 * exactly LIVE or exactly SUSPENDED, never UNPUBLISHED.
 *
 * Deliberately runs after the billing transition's own transaction commits,
 * not inside it — a real, accepted trade-off: if this step fails, the
 * billing transition itself has already succeeded (billing state is always
 * authoritative on its own), and publication state would be briefly stale
 * until the next billing transition or a manual reconciliation, not
 * silently incorrect forever.
 */
export async function syncPublicationsForBillingAccessChange(
  organizationId: string,
  billingState: BillingState,
): Promise<void> {
  const accessLevel = getAccessLevel(billingState);

  if (accessLevel !== "full") {
    const toSuspend = await db.projectPublication.findMany({
      where: { status: "LIVE", project: { organizationId } },
      select: { id: true, projectId: true },
    });
    if (toSuspend.length === 0) return;

    await db.projectPublication.updateMany({
      where: { id: { in: toSuspend.map((publication) => publication.id) } },
      data: { status: "SUSPENDED", suspensionReason: `Billing state: ${billingState}` },
    });

    for (const publication of toSuspend) {
      await recordAuditLogEntry({
        organizationId,
        action: "PROJECT_PUBLICATION_SUSPENDED",
        targetType: "ProjectPublication",
        targetId: publication.id,
        metadata: { projectId: publication.projectId, billingState },
      });
      await db.productEvent.create({
        data: {
          projectId: publication.projectId,
          type: "PROJECT_PUBLICATION_SUSPENDED",
          summary: `Publication suspended — billing state is now ${billingState}.`,
          data: { billingState },
        },
      });
    }
    return;
  }

  const toRestore = await db.projectPublication.findMany({
    where: { status: "SUSPENDED", project: { organizationId } },
    select: { id: true, projectId: true },
  });
  if (toRestore.length === 0) return;

  await db.projectPublication.updateMany({
    where: { id: { in: toRestore.map((publication) => publication.id) } },
    data: { status: "LIVE", suspensionReason: null },
  });

  for (const publication of toRestore) {
    await recordAuditLogEntry({
      organizationId,
      action: "PROJECT_PUBLICATION_RESTORED",
      targetType: "ProjectPublication",
      targetId: publication.id,
      metadata: { projectId: publication.projectId, billingState },
    });
    await db.productEvent.create({
      data: {
        projectId: publication.projectId,
        type: "PROJECT_PUBLICATION_RESTORED",
        summary: `Publication restored — billing state is now ${billingState}.`,
        data: { billingState },
      },
    });
  }
}
