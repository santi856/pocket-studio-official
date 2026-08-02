// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { seedPlans } from "@/lib/billing/seed-plans";
import { createSubscription } from "@/lib/billing/subscription";
import {
  PublishNotAllowedError,
  PublishingAccessRestrictedError,
} from "@/lib/billing/entitlements";
import {
  NoGenerationToPublishError,
  NoLastKnownGoodVersionError,
  NothingToUnpublishError,
  publishProject,
  restoreLastKnownGoodVersion,
  unpublishProject,
} from "./publishing";

describe("publishing", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedGenerationVersion(projectId: string, actorUserId: string, version: number) {
    await db.blueprint.create({
      data: {
        projectId,
        version,
        schemaVersion: "1.0",
        validationStatus: "VALID",
        createdByUserId: actorUserId,
      },
    });
    await db.buildPlan.create({
      data: {
        projectId,
        version,
        basedOnBlueprintVersion: version,
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
        createdByUserId: actorUserId,
      },
    });
  }

  /** LAUNCH is the cheapest plan with deploymentAllowed:true (seed-plans.ts). */
  async function seedPublishablOrg(name = "Detailer Co") {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name, ownerUserId: owner.id });
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
    return { owner, org, project };
  }

  describe("publishProject", () => {
    it("throws NoGenerationToPublishError when the project has no Blueprint/Build Plan yet", async () => {
      const { owner, project } = await seedPublishablOrg();

      await expect(publishProject(owner.id, project.id)).rejects.toBeInstanceOf(
        NoGenerationToPublishError,
      );
    });

    it("throws PublishNotAllowedError on a plan without deploymentAllowed (e.g. the default Free/Explore)", async () => {
      const owner = await registerUser({ email: "owner@example.com", password: "password123" });
      const org = await createOrganization({ name: "Free Co", ownerUserId: owner.id });
      await createSubscription(owner.id, org.id); // FREE_EXPLORE, deploymentAllowed: false
      const project = await createProject({
        organizationId: org.id,
        name: "Booking App",
        createdByUserId: owner.id,
      });
      await seedGenerationVersion(project.id, owner.id, 1);

      await expect(publishProject(owner.id, project.id)).rejects.toBeInstanceOf(
        PublishNotAllowedError,
      );
    });

    it("throws PublishingAccessRestrictedError when billing access is not full", async () => {
      const { owner, org, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await db.organizationSubscription.update({
        where: { organizationId: org.id },
        data: { billingState: "SUSPENDED" },
      });

      await expect(publishProject(owner.id, project.id)).rejects.toBeInstanceOf(
        PublishingAccessRestrictedError,
      );
    });

    it("publishes the first version, pinning the exact Blueprint/Build Plan version pair and assigning a public slug", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);

      const publication = await publishProject(owner.id, project.id);

      expect(publication.status).toBe("LIVE");
      expect(publication.publishedBlueprintVersion).toBe(1);
      expect(publication.publishedBuildPlanVersion).toBe(1);
      expect(publication.publicSlug).toBe("booking-app");
      expect(publication.publishedByUserId).toBe(owner.id);
      expect(publication.lastKnownGoodBlueprintVersion).toBeNull();

      const events = await db.productEvent.findMany({
        where: { projectId: project.id, type: "PROJECT_PUBLISHED" },
      });
      expect(events).toHaveLength(1);
      const auditEntries = await db.auditLogEntry.findMany({
        where: {
          organizationId: (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
            .organizationId,
          action: "PROJECT_PUBLISHED",
        },
      });
      expect(auditEntries).toHaveLength(1);
    });

    it("draft edits (a new Blueprint/Build Plan version) do not change what is published until republished", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      const first = await publishProject(owner.id, project.id);
      await seedGenerationVersion(project.id, owner.id, 2);

      const stillPublished = await db.projectPublication.findUnique({
        where: { projectId: project.id },
      });
      expect(stillPublished?.publishedBlueprintVersion).toBe(1);
      expect(stillPublished?.publishedBuildPlanVersion).toBe(1);
      expect(stillPublished?.id).toBe(first.id);
    });

    it("publishing an update pins the new version and moves the old one to lastKnownGood", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);
      await seedGenerationVersion(project.id, owner.id, 2);

      const updated = await publishProject(owner.id, project.id);

      expect(updated.publishedBlueprintVersion).toBe(2);
      expect(updated.publishedBuildPlanVersion).toBe(2);
      expect(updated.lastKnownGoodBlueprintVersion).toBe(1);
      expect(updated.lastKnownGoodBuildPlanVersion).toBe(1);
      expect(updated.publicSlug).toBe("booking-app"); // immutable across republishes
    });

    it("is idempotent — republishing the exact same version pair changes nothing and records no new events", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);

      await publishProject(owner.id, project.id);

      const events = await db.productEvent.findMany({
        where: { projectId: project.id, type: "PROJECT_PUBLISHED" },
      });
      expect(events).toHaveLength(1);
    });

    it("republishing after an unpublish clears suspension/failure state and goes LIVE again", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);
      await unpublishProject(owner.id, project.id);

      const republished = await publishProject(owner.id, project.id);

      expect(republished.status).toBe("LIVE");
    });

    it("denies access to a non-member", async () => {
      const { project } = await seedPublishablOrg();
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });

      await expect(publishProject(outsider.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("unpublishProject", () => {
    it("throws NothingToUnpublishError when the project has never been published", async () => {
      const { owner, project } = await seedPublishablOrg();

      await expect(unpublishProject(owner.id, project.id)).rejects.toBeInstanceOf(
        NothingToUnpublishError,
      );
    });

    it("marks a LIVE publication UNPUBLISHED", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);

      const result = await unpublishProject(owner.id, project.id);

      expect(result.status).toBe("UNPUBLISHED");
    });

    it("is idempotent — unpublishing an already-unpublished project is a no-op", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);
      await unpublishProject(owner.id, project.id);

      await expect(unpublishProject(owner.id, project.id)).resolves.toMatchObject({
        status: "UNPUBLISHED",
      });

      const events = await db.productEvent.findMany({
        where: { projectId: project.id, type: "PROJECT_UNPUBLISHED" },
      });
      expect(events).toHaveLength(1);
    });
  });

  describe("restoreLastKnownGoodVersion", () => {
    it("throws NoLastKnownGoodVersionError when there is nothing to restore", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);

      await expect(restoreLastKnownGoodVersion(owner.id, project.id)).rejects.toBeInstanceOf(
        NoLastKnownGoodVersionError,
      );
    });

    it("restores the previous version and the restore is itself reversible", async () => {
      const { owner, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);
      await seedGenerationVersion(project.id, owner.id, 2);
      await publishProject(owner.id, project.id);

      const restored = await restoreLastKnownGoodVersion(owner.id, project.id);
      expect(restored.publishedBlueprintVersion).toBe(1);
      expect(restored.publishedBuildPlanVersion).toBe(1);
      expect(restored.lastKnownGoodBlueprintVersion).toBe(2);

      // Restoring again flips back to version 2 — a real swap, not a one-way trip.
      const restoredAgain = await restoreLastKnownGoodVersion(owner.id, project.id);
      expect(restoredAgain.publishedBlueprintVersion).toBe(2);
      expect(restoredAgain.lastKnownGoodBlueprintVersion).toBe(1);
    });

    it("clears a SUSPENDED status when restoring", async () => {
      const { owner, org, project } = await seedPublishablOrg();
      await seedGenerationVersion(project.id, owner.id, 1);
      await publishProject(owner.id, project.id);
      await seedGenerationVersion(project.id, owner.id, 2);
      await publishProject(owner.id, project.id);
      await db.projectPublication.update({
        where: { projectId: project.id },
        data: { status: "SUSPENDED", suspensionReason: "test" },
      });
      void org;

      const restored = await restoreLastKnownGoodVersion(owner.id, project.id);

      expect(restored.status).toBe("LIVE");
      expect(restored.suspensionReason).toBeNull();
    });
  });
});
