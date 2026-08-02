// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedPlans } from "@/lib/billing/seed-plans";
import { createSubscription, transitionBillingState } from "@/lib/billing/subscription";
import { publishProject } from "./publishing";

describe("publication-billing-sync (via applyBillingStateTransition)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedLivePublishedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { planKey: "LAUNCH" },
    });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    await db.blueprint.create({
      data: {
        projectId: project.id,
        version: 1,
        schemaVersion: "1.0",
        validationStatus: "VALID",
        createdByUserId: owner.id,
      },
    });
    await db.buildPlan.create({
      data: {
        projectId: project.id,
        version: 1,
        basedOnBlueprintVersion: 1,
        planStatus: "READY",
        implementationPhases: {},
        dependencies: {},
        screenOrder: {},
        componentStructure: {},
        navigationGraph: {},
        dataDependencies: {},
        backendAndBusinessLogic: {},
        administrativeRequirements: {},
        integrations: {},
        monetization: {},
        platformRequirements: {},
        persistence: {},
        tests: {},
        acceptanceCriteria: {},
        evidenceRequirements: {},
        risk: {},
        blockers: {},
        createdByUserId: owner.id,
      },
    });
    await publishProject(owner.id, project.id);
    return { owner, org, project };
  }

  it("suspends a LIVE publication when billing state transitions away from ACTIVE via CANCEL_REQUESTED", async () => {
    const { owner, org, project } = await seedLivePublishedProject();
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "ACTIVE" },
    });

    await transitionBillingState(owner.id, org.id, "CANCEL_REQUESTED");

    const publication = await db.projectPublication.findUnique({
      where: { projectId: project.id },
    });
    expect(publication?.status).toBe("SUSPENDED");
    expect(publication?.suspensionReason).toContain("CANCELED");

    const events = await db.productEvent.findMany({
      where: { projectId: project.id, type: "PROJECT_PUBLICATION_SUSPENDED" },
    });
    expect(events).toHaveLength(1);
  });

  it("restores a SUSPENDED publication when billing recovers back to ACTIVE", async () => {
    const { owner, org, project } = await seedLivePublishedProject();
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "PAST_DUE" },
    });
    await transitionBillingState(owner.id, org.id, "PAYMENT_RETRY_EXHAUSTED"); // -> PAYMENT_RETRYING
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "GRACE_PERIOD" },
    });
    await transitionBillingState(owner.id, org.id, "GRACE_PERIOD_EXPIRED"); // -> RESTRICTED

    let publication = await db.projectPublication.findUnique({ where: { projectId: project.id } });
    expect(publication?.status).toBe("SUSPENDED");

    await transitionBillingState(owner.id, org.id, "PAYMENT_RECOVERED"); // RESTRICTED -> ACTIVE

    publication = await db.projectPublication.findUnique({ where: { projectId: project.id } });
    expect(publication?.status).toBe("LIVE");
    expect(publication?.suspensionReason).toBeNull();

    const restoredEvents = await db.productEvent.findMany({
      where: { projectId: project.id, type: "PROJECT_PUBLICATION_RESTORED" },
    });
    expect(restoredEvents).toHaveLength(1);
  });

  it("never restores a publication the customer explicitly unpublished, even after billing recovers", async () => {
    const { owner, org, project } = await seedLivePublishedProject();
    const { unpublishProject } = await import("./publishing");
    await unpublishProject(owner.id, project.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "SUSPENDED" },
    });

    await transitionBillingState(owner.id, org.id, "PAYMENT_RECOVERED");

    const publication = await db.projectPublication.findUnique({
      where: { projectId: project.id },
    });
    expect(publication?.status).toBe("UNPUBLISHED");
  });
});
