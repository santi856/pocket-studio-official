// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { upsertIntegrationRequirement } from "@/lib/product/integrations";
import { setTruthStatus } from "@/lib/product/truth-status";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { getProductAnalyticsSnapshot } from "./product-analytics";

describe("getProductAnalyticsSnapshot", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    return { owner, outsider, project };
  }

  it("returns real, zeroed counts for a project with no activity yet", async () => {
    const { owner, project } = await seedProject();

    const snapshot = await getProductAnalyticsSnapshot(owner.id, project.id);

    expect(snapshot.generatedAppUserCount).toBe(0);
    expect(snapshot.generatedRecordCountByModelKey).toEqual({});
    expect(snapshot.payments).toEqual({
      succeeded: 0,
      failed: 0,
      pending: 0,
      totalSucceededAmountCents: 0,
    });
    expect(snapshot.latestStoreSubmissionStatusByPlatform).toEqual({ IOS: null, ANDROID: null });
    expect(snapshot.truthStatusImplementedFraction).toBeNull();
  });

  it("aggregates real generated-app users and records", async () => {
    const { owner, project } = await seedProject();
    await db.generatedAppUser.create({
      data: { projectId: project.id, email: "a@example.com", passwordHash: "x", role: "customer" },
    });
    await db.generatedAppUser.create({
      data: { projectId: project.id, email: "b@example.com", passwordHash: "x", role: "customer" },
    });
    await db.generatedRecord.create({
      data: { projectId: project.id, modelKey: "Booking", data: {} },
    });
    await db.generatedRecord.create({
      data: { projectId: project.id, modelKey: "Booking", data: {} },
    });
    await db.generatedRecord.create({
      data: { projectId: project.id, modelKey: "Review", data: {} },
    });

    const snapshot = await getProductAnalyticsSnapshot(owner.id, project.id);

    expect(snapshot.generatedAppUserCount).toBe(2);
    expect(snapshot.generatedRecordCountByModelKey).toEqual({ Booking: 2, Review: 1 });
  });

  it("aggregates real payment outcomes and total succeeded revenue", async () => {
    const { owner, project } = await seedProject();
    const requirement = await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "CONNECTED",
    });
    await db.generatedAppPayment.create({
      data: {
        projectId: project.id,
        integrationRequirementId: requirement.id,
        amountCents: 5000,
        description: "Deposit",
        status: "SUCCEEDED",
      },
    });
    await db.generatedAppPayment.create({
      data: {
        projectId: project.id,
        integrationRequirementId: requirement.id,
        amountCents: 3000,
        description: "Deposit",
        status: "SUCCEEDED",
      },
    });
    await db.generatedAppPayment.create({
      data: {
        projectId: project.id,
        integrationRequirementId: requirement.id,
        amountCents: 2000,
        description: "Deposit",
        status: "FAILED",
      },
    });

    const snapshot = await getProductAnalyticsSnapshot(owner.id, project.id);

    expect(snapshot.payments).toEqual({
      succeeded: 2,
      failed: 1,
      pending: 0,
      totalSucceededAmountCents: 8000,
    });
  });

  it("aggregates real deployments by environment and status", async () => {
    const { owner, project } = await seedProject();
    await db.deployment.createMany({
      data: [
        {
          projectId: project.id,
          environment: "PRODUCTION",
          status: "SUCCEEDED",
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
          environment: "STAGING",
          status: "SUCCEEDED",
          blueprintVersion: 1,
          buildPlanVersion: 1,
          provider: "mock",
          createdByUserId: owner.id,
        },
      ],
    });

    const snapshot = await getProductAnalyticsSnapshot(owner.id, project.id);

    expect(snapshot.deploymentsByEnvironment.PRODUCTION).toEqual({
      succeeded: 1,
      failed: 1,
      rolledBack: 0,
    });
    expect(snapshot.deploymentsByEnvironment.STAGING).toEqual({
      succeeded: 1,
      failed: 0,
      rolledBack: 0,
    });
  });

  it("reports the latest store submission status per platform", async () => {
    const { owner, project } = await seedProject();
    await db.storeSubmission.create({
      data: {
        projectId: project.id,
        platform: "IOS",
        track: "PRODUCTION",
        version: "1.0.0",
        buildNumber: 1,
        status: "IN_REVIEW",
        basedOnBlueprintVersion: 1,
        createdByUserId: owner.id,
      },
    });
    await db.storeSubmission.create({
      data: {
        projectId: project.id,
        platform: "IOS",
        track: "PRODUCTION",
        version: "1.0.1",
        buildNumber: 2,
        status: "REJECTED",
        basedOnBlueprintVersion: 1,
        createdByUserId: owner.id,
      },
    });

    const snapshot = await getProductAnalyticsSnapshot(owner.id, project.id);

    // Newest first — the second (later-created) submission is the latest.
    expect(snapshot.latestStoreSubmissionStatusByPlatform.IOS).toBe("REJECTED");
    expect(snapshot.latestStoreSubmissionStatusByPlatform.ANDROID).toBeNull();
  });

  it("computes the fraction of Truth Status subjects currently IMPLEMENTED", async () => {
    const { owner, project } = await seedProject();
    await setTruthStatus(owner.id, project.id, {
      subjectKey: "quality.gate",
      subjectLabel: "Quality Gate",
      status: "IMPLEMENTED",
    });
    await setTruthStatus(owner.id, project.id, {
      subjectKey: "store.readiness",
      subjectLabel: "Store Readiness",
      status: "BLOCKED",
    });

    const snapshot = await getProductAnalyticsSnapshot(owner.id, project.id);

    expect(snapshot.truthStatusImplementedFraction).toBe(0.5);
  });

  it("denies access to a non-member", async () => {
    const { outsider, project } = await seedProject();

    await expect(getProductAnalyticsSnapshot(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
