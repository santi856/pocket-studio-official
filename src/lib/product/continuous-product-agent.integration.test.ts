// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createSubscription } from "@/lib/billing/subscription";
import { seedPlans } from "@/lib/billing/seed-plans";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { proposeContinuousProductRecommendations } from "./continuous-product-agent";

describe("proposeContinuousProductRecommendations", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    return { owner, outsider, org, project };
  }

  it("proposes nothing when business health is OK", async () => {
    const { owner, project } = await seedProject();

    const proposals = await proposeContinuousProductRecommendations(owner.id, project.id);

    expect(proposals).toEqual([]);
  });

  it("proposes a real, CONSEQUENTIAL, PENDING_APPROVAL Decision for a real finding, never auto-applying it", async () => {
    const { owner, org, project } = await seedProject();
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "RESTRICTED" },
    });

    const proposals = await proposeContinuousProductRecommendations(owner.id, project.id);

    expect(proposals).toHaveLength(1);
    const decision = proposals[0];
    expect(decision?.source).toBe("continuous-product-agent");
    expect(decision?.summary).toBe("Billing state");
    expect(decision?.disclosureTier).toBe("CONSEQUENTIAL");
    expect(decision?.approvalStatus).toBe("PENDING_APPROVAL");
    expect(decision?.recommendation).toContain("Resolve the outstanding payment issue");

    // Confirms it is a real, durable row — not merely returned in-memory.
    const stored = await db.decision.findUnique({ where: { id: decision?.id } });
    expect(stored?.approvalStatus).toBe("PENDING_APPROVAL");
  });

  it("does not propose a duplicate while an identical recommendation is already pending", async () => {
    const { owner, org, project } = await seedProject();
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "PAST_DUE" },
    });

    const first = await proposeContinuousProductRecommendations(owner.id, project.id);
    const second = await proposeContinuousProductRecommendations(owner.id, project.id);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    const total = await db.decision.count({
      where: { projectId: project.id, source: "continuous-product-agent" },
    });
    expect(total).toBe(1);
  });

  it("denies access to a non-member", async () => {
    const { outsider, project } = await seedProject();

    await expect(
      proposeContinuousProductRecommendations(outsider.id, project.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
