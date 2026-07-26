import "server-only";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import type { AccountDeletionRequest } from "@/generated/prisma/client";

const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — founder decision, 2026-07-25

export class AccountDeletionAlreadyPendingError extends Error {
  constructor() {
    super("This organization already has a pending deletion request.");
    this.name = "AccountDeletionAlreadyPendingError";
  }
}

export class NoAccountDeletionPendingError extends Error {
  constructor() {
    super("This organization has no pending deletion request to cancel.");
    this.name = "NoAccountDeletionPendingError";
  }
}

/**
 * Customer-initiated permanent account deletion — distinct from the
 * billing lifecycle's own cancellation path (src/lib/billing/access.ts),
 * which Master Spec §62 requires to never delete customer-owned data as a
 * consequence of nonpayment (see customer-data-protection.integration.test.ts).
 * This is the other, legitimate case: the organization's owner explicitly
 * asks Pocket Studio to delete their account and its data, independent of
 * billing state. Requires OWNER, not just membership — this is the most
 * consequential action an organization member can take.
 */
export async function requestAccountDeletion(
  actorUserId: string,
  organizationId: string,
): Promise<AccountDeletionRequest> {
  await requireOrganizationMembership(actorUserId, organizationId, "OWNER");

  const existing = await db.accountDeletionRequest.findFirst({
    where: { organizationId, status: "PENDING" },
  });
  if (existing) {
    throw new AccountDeletionAlreadyPendingError();
  }

  return db.accountDeletionRequest.create({
    data: {
      organizationId,
      requestedByUserId: actorUserId,
      scheduledPurgeAt: new Date(Date.now() + GRACE_PERIOD_MS),
    },
  });
}

/**
 * Reverses a still-pending request within its grace period — the safety
 * net a 30-day window exists to provide. Once a request has already been
 * executed (status EXECUTED), there is nothing left to cancel: the data is
 * genuinely gone.
 */
export async function cancelAccountDeletionRequest(
  actorUserId: string,
  organizationId: string,
): Promise<AccountDeletionRequest> {
  await requireOrganizationMembership(actorUserId, organizationId, "OWNER");

  const existing = await db.accountDeletionRequest.findFirst({
    where: { organizationId, status: "PENDING" },
  });
  if (!existing) {
    throw new NoAccountDeletionPendingError();
  }

  return db.accountDeletionRequest.update({
    where: { id: existing.id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
}

export async function getAccountDeletionStatus(
  actorUserId: string,
  organizationId: string,
): Promise<AccountDeletionRequest | null> {
  await requireOrganizationMembership(actorUserId, organizationId, "MEMBER");

  return db.accountDeletionRequest.findFirst({
    where: { organizationId, status: "PENDING" },
  });
}

/**
 * The actual purge — deliberately not actor-gated (system-triggered, same
 * shape of exception as applyBillingLifecycleEventFromWebhook: there is no
 * Pocket Studio member "acting" when this runs; the organization's own
 * owner already authorized it when requestAccountDeletion's grace period
 * was set, and it has since elapsed). No cron/scheduler infrastructure
 * exists in this codebase yet (a disclosed gap shared with every other
 * time-based transition here, e.g. RETENTION_PERIOD_EXPIRED) — this is
 * the real, tested primitive a future scheduled job or operator calls.
 *
 * Deletes every Project (cascading to GeneratedAppUser, GeneratedRecord,
 * IntegrationRequirement, CredentialReference, BuildPlan, Blueprint, and
 * everything else scoped to a project) and every Membership for the
 * organization. The Organization row itself is kept — anonymized, not
 * deleted — because OrganizationSubscription/BillingEvent cascade from
 * Organization (onDelete: Cascade); deleting it would destroy the billing
 * and invoice history the founder decided must survive (2026-07-25). Only
 * one purge in this codebase actually deletes an Organization row's own
 * projects/memberships this way — it is the sole authoritative
 * implementation of what "account deletion" means here.
 */
export async function executeDueAccountDeletions(): Promise<AccountDeletionRequest[]> {
  const due = await db.accountDeletionRequest.findMany({
    where: { status: "PENDING", scheduledPurgeAt: { lte: new Date() } },
  });

  const executed: AccountDeletionRequest[] = [];

  for (const request of due) {
    const result = await db.$transaction(async (tx) => {
      await tx.project.deleteMany({ where: { organizationId: request.organizationId } });
      await tx.membership.deleteMany({ where: { organizationId: request.organizationId } });
      await tx.organization.update({
        where: { id: request.organizationId },
        data: { name: "[deleted organization]" },
      });
      return tx.accountDeletionRequest.update({
        where: { id: request.id },
        data: { status: "EXECUTED", executedAt: new Date() },
      });
    });
    executed.push(result);
  }

  return executed;
}
