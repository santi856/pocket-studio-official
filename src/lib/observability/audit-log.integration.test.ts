// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { listAuditLogEntries, recordAuditLogEntry } from "./audit-log";

describe("audit log", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedOrg() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    return { owner, org };
  }

  it("records a real entry with the given action, target, and metadata", async () => {
    const { owner, org } = await seedOrg();

    const entry = await recordAuditLogEntry({
      organizationId: org.id,
      actorUserId: owner.id,
      action: "CREDENTIAL_STORED",
      targetType: "CredentialReference",
      targetId: "cred-123",
      metadata: { provider: "stripe" },
    });

    expect(entry.action).toBe("CREDENTIAL_STORED");
    expect(entry.targetId).toBe("cred-123");
  });

  it("lists entries for an org, newest first", async () => {
    const { owner, org } = await seedOrg();
    await recordAuditLogEntry({
      organizationId: org.id,
      actorUserId: owner.id,
      action: "CREDENTIAL_STORED",
      targetType: "CredentialReference",
      targetId: "cred-1",
    });
    await recordAuditLogEntry({
      organizationId: org.id,
      actorUserId: owner.id,
      action: "CREDENTIAL_ACCESSED",
      targetType: "CredentialReference",
      targetId: "cred-1",
    });

    const entries = await listAuditLogEntries(owner.id, org.id);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.action).toBe("CREDENTIAL_ACCESSED");
  });

  it("denies a plain MEMBER (not ADMIN or OWNER) from listing the audit log", async () => {
    const { org } = await seedOrg();
    const member = await registerUser({ email: "member@example.com", password: "password123" });
    await db.membership.create({
      data: { userId: member.id, organizationId: org.id, role: "MEMBER" },
    });

    await expect(listAuditLogEntries(member.id, org.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("survives organization deletion — the audit trail is not cascade-deleted", async () => {
    const { owner, org } = await seedOrg();
    const entry = await recordAuditLogEntry({
      organizationId: org.id,
      actorUserId: owner.id,
      action: "CREDENTIAL_STORED",
      targetType: "CredentialReference",
      targetId: "cred-1",
    });

    await db.organization.delete({ where: { id: org.id } });

    const survived = await db.auditLogEntry.findUnique({ where: { id: entry.id } });
    expect(survived).not.toBeNull();
    expect(survived?.organizationId).toBeNull();
  });
});
