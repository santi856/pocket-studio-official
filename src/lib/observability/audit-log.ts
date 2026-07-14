import "server-only";
import { db } from "@/lib/db";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import type { AuditLogAction, AuditLogEntry, Prisma } from "@/generated/prisma/client";

export type RecordAuditLogEntryInput = {
  organizationId?: string;
  actorUserId?: string;
  action: AuditLogAction;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Master Spec §31/§61 "audit logs". Deliberately has no actorUserId-based
 * authorization check of its own — every real caller already sits behind
 * its own tenant-isolation check (storeCredential/retrieveCredentialSecret
 * and transitionBillingState all require MEMBER/OWNER access before
 * reaching this call); this function's only job is durably recording
 * what already happened,
 * the same "record the fact, don't re-derive authorization" posture as
 * recordEvidence. Never records the credential secret or any other
 * sensitive payload itself — only which action occurred, against which
 * target, by whom.
 */
export async function recordAuditLogEntry(input: RecordAuditLogEntryInput): Promise<AuditLogEntry> {
  return db.auditLogEntry.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    },
  });
}

/**
 * Viewing an organization's audit trail is itself a sensitive action —
 * requires ADMIN, not just MEMBER (unlike almost every other
 * organization-scoped read in this codebase), since the audit log can
 * reveal who accessed which credentials and when.
 */
export async function listAuditLogEntries(
  actorUserId: string,
  organizationId: string,
): Promise<AuditLogEntry[]> {
  await requireOrganizationMembership(actorUserId, organizationId, "ADMIN");

  return db.auditLogEntry.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}
