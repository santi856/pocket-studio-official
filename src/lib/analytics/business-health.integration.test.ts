// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createSubscription } from "@/lib/billing/subscription";
import { seedPlans } from "@/lib/billing/seed-plans";
import { setTruthStatus, getLatestTruthStatus } from "@/lib/product/truth-status";
import { listEvidence } from "@/lib/product/evidence";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { assessBusinessHealth } from "./business-health";

describe("assessBusinessHealth", () => {
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

  it("is OK when billing is trialing and nothing else is wrong", async () => {
    const { owner, project } = await seedProject();

    const assessment = await assessBusinessHealth(owner.id, project.id);

    expect(assessment.overallSeverity).toBe("OK");
    expect(assessment.findings).toHaveLength(1);
    expect(assessment.findings[0]?.name).toBe("Billing state");
    expect(assessment.findings[0]?.severity).toBe("OK");
  });

  it("is CRITICAL when billing is RESTRICTED", async () => {
    const { owner, org, project } = await seedProject();
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "RESTRICTED" },
    });

    const assessment = await assessBusinessHealth(owner.id, project.id);

    expect(assessment.overallSeverity).toBe("CRITICAL");
  });

  it("is ATTENTION when billing is PAST_DUE", async () => {
    const { owner, org, project } = await seedProject();
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "PAST_DUE" },
    });

    const assessment = await assessBusinessHealth(owner.id, project.id);

    expect(assessment.overallSeverity).toBe("ATTENTION");
  });

  it("flags a blocked Quality Gate as ATTENTION with a fixed recommendation", async () => {
    const { owner, project } = await seedProject();
    await setTruthStatus(owner.id, project.id, {
      subjectKey: "quality.gate",
      subjectLabel: "Quality Gate",
      status: "BLOCKED",
      rationale: "2 checks failed.",
    });

    const assessment = await assessBusinessHealth(owner.id, project.id);

    const finding = assessment.findings.find((f) => f.name === "Quality Gate");
    expect(finding?.severity).toBe("ATTENTION");
    expect(finding?.recommendation).toContain("Review the failed Quality Gate checks");
  });

  it("flags a high recent deployment failure rate as ATTENTION", async () => {
    const { owner, project } = await seedProject();
    await db.deployment.createMany({
      data: [
        {
          projectId: project.id,
          environment: "PRODUCTION",
          status: "FAILED",
          blueprintVersion: 1,
          buildPlanVersion: 1,
          provider: "mock",
          createdByUserId: owner.id,
        },
        {
          projectId: project.id,
          environment: "PRODUCTION",
          status: "FAILED",
          blueprintVersion: 1,
          buildPlanVersion: 1,
          provider: "mock",
          createdByUserId: owner.id,
        },
        {
          projectId: project.id,
          environment: "PRODUCTION",
          status: "SUCCEEDED",
          blueprintVersion: 1,
          buildPlanVersion: 1,
          provider: "mock",
          createdByUserId: owner.id,
        },
      ],
    });

    const assessment = await assessBusinessHealth(owner.id, project.id);

    const finding = assessment.findings.find((f) => f.name === "Deployment reliability");
    expect(finding?.severity).toBe("ATTENTION");
  });

  it("does not flag deployment reliability with fewer than 3 recent deployments", async () => {
    const { owner, project } = await seedProject();
    await db.deployment.create({
      data: {
        projectId: project.id,
        environment: "PRODUCTION",
        status: "FAILED",
        blueprintVersion: 1,
        buildPlanVersion: 1,
        provider: "mock",
        createdByUserId: owner.id,
      },
    });

    const assessment = await assessBusinessHealth(owner.id, project.id);

    expect(assessment.findings.find((f) => f.name === "Deployment reliability")).toBeUndefined();
  });

  it("flags a rejected store submission as ATTENTION", async () => {
    const { owner, project } = await seedProject();
    await db.storeSubmission.create({
      data: {
        projectId: project.id,
        platform: "ANDROID",
        track: "PRODUCTION",
        version: "1.0.0",
        buildNumber: 1,
        status: "REJECTED",
        rejectionReason: "Missing privacy disclosure.",
        basedOnBlueprintVersion: 1,
        createdByUserId: owner.id,
      },
    });

    const assessment = await assessBusinessHealth(owner.id, project.id);

    const finding = assessment.findings.find((f) => f.name === "Store submission (ANDROID)");
    expect(finding?.severity).toBe("ATTENTION");
    expect(finding?.details).toContain("privacy disclosure");
  });

  it("records real Evidence and syncs business.health Truth Status", async () => {
    const { owner, project } = await seedProject();

    await assessBusinessHealth(owner.id, project.id);

    const status = await getLatestTruthStatus(owner.id, project.id, "business.health");
    expect(status?.status).toBe("IMPLEMENTED");
    const evidence = await listEvidence(owner.id, project.id, { subjectKey: "business.health" });
    expect(evidence).toHaveLength(1);
  });

  it("syncs business.health Truth Status to BLOCKED when a finding needs attention", async () => {
    const { owner, org, project } = await seedProject();
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "SUSPENDED" },
    });

    await assessBusinessHealth(owner.id, project.id);

    const status = await getLatestTruthStatus(owner.id, project.id, "business.health");
    expect(status?.status).toBe("BLOCKED");
  });

  it("denies assessment for a non-member", async () => {
    const { outsider, project } = await seedProject();

    await expect(assessBusinessHealth(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
