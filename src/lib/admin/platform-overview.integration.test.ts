// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createSubscription } from "@/lib/billing/subscription";
import { seedPlans } from "@/lib/billing/seed-plans";
import { grantPlatformAdmin } from "@/lib/tenancy/platform-admin";
import { reportIncident } from "@/lib/observability/incident-response";
import { recordAiUsageEvent } from "@/lib/observability/ai-usage";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { getPlatformOverview, listAllOrganizations } from "./platform-overview";

describe("platform overview", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedAdmin() {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    return admin;
  }

  it("lists every organization across every tenant, denying a non-admin", async () => {
    const admin = await seedAdmin();
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);

    const organizations = await listAllOrganizations(admin.id);

    expect(organizations.map((o) => o.id)).toContain(org.id);
    expect(organizations.find((o) => o.id === org.id)?.subscription?.planKey).toBe("FREE_EXPLORE");

    await expect(listAllOrganizations(owner.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("aggregates real counts across the entire platform", async () => {
    const admin = await seedAdmin();
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);
    await createProject({ organizationId: org.id, name: "Booking App", createdByUserId: owner.id });
    await recordAiUsageEvent({
      organizationId: org.id,
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 50,
    });
    await reportIncident(admin.id, {
      title: "Test incident",
      severity: "LOW",
      description: "x",
      detectedAt: new Date(),
    });

    const overview = await getPlatformOverview(admin.id);

    expect(overview.organizationCount).toBeGreaterThanOrEqual(1);
    expect(overview.projectCount).toBeGreaterThanOrEqual(1);
    expect(overview.userCount).toBeGreaterThanOrEqual(2);
    expect(overview.organizationCountByBillingState.TRIALING).toBeGreaterThanOrEqual(1);
    expect(overview.incidentCountByStatus.OPEN).toBeGreaterThanOrEqual(1);
    expect(overview.totalAiInputTokens).toBeGreaterThanOrEqual(100);
    expect(overview.totalAiEstimatedCostCents).toBeNull();
  });

  it("denies overview access to a non-admin", async () => {
    const nonAdmin = await registerUser({ email: "nonadmin@example.com", password: "password123" });

    await expect(getPlatformOverview(nonAdmin.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
