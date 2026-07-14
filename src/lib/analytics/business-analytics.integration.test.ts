// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createSubscription } from "@/lib/billing/subscription";
import { seedPlans } from "@/lib/billing/seed-plans";
import { recordAiUsageEvent } from "@/lib/observability/ai-usage";
import { recordAuditLogEntry } from "@/lib/observability/audit-log";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { getBusinessAnalyticsSnapshot } from "./business-analytics";

describe("getBusinessAnalyticsSnapshot", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
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

  it("reports FREE_EXPLORE/TRIALING defaults when no subscription exists yet", async () => {
    const { owner, org } = await seedOrg();

    const snapshot = await getBusinessAnalyticsSnapshot(owner.id, org.id);

    expect(snapshot.planKey).toBe("FREE_EXPLORE");
    expect(snapshot.billingState).toBe("TRIALING");
    expect(snapshot.projectCount).toBe(0);
    expect(snapshot.aiUsage.eventCount).toBe(0);
    expect(snapshot.auditLogEntryCount).toBe(0);
  });

  it("aggregates real subscription state, project count, AI usage, and audit activity", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);
    // FREE_EXPLORE (this org's real plan) allows only 1 project — real
    // entitlement enforcement (P3-03), not a test bug.
    await createProject({ organizationId: org.id, name: "Booking App", createdByUserId: owner.id });
    await recordAiUsageEvent({
      organizationId: org.id,
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 50,
    });
    await recordAuditLogEntry({
      organizationId: org.id,
      actorUserId: owner.id,
      action: "CREDENTIAL_STORED",
      targetType: "CredentialReference",
      targetId: "cred-1",
    });

    const snapshot = await getBusinessAnalyticsSnapshot(owner.id, org.id);

    expect(snapshot.planKey).toBe("FREE_EXPLORE");
    expect(snapshot.billingState).toBe("TRIALING");
    expect(snapshot.projectCount).toBe(1);
    expect(snapshot.aiUsage.eventCount).toBe(1);
    expect(snapshot.aiUsage.totalInputTokens).toBe(100);
    expect(snapshot.auditLogEntryCount).toBe(1);
  });

  it("denies a plain MEMBER (not ADMIN or OWNER)", async () => {
    const { org } = await seedOrg();
    const member = await registerUser({ email: "member@example.com", password: "password123" });
    await db.membership.create({
      data: { userId: member.id, organizationId: org.id, role: "MEMBER" },
    });

    await expect(getBusinessAnalyticsSnapshot(member.id, org.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
