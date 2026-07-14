// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { setTruthStatus } from "@/lib/product/truth-status";
import { listEvidence } from "@/lib/product/evidence";
import {
  NoGenerationToDeployError,
  NoPreviousDeploymentToRollBackToError,
  ProductionDeploymentBlockedError,
  createDeployment,
  getActiveDeployment,
  listDeployments,
  rollbackDeployment,
} from "./deployments";

describe("deployments", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  /**
   * Direct db.blueprint.create/db.buildPlan.create with placeholder JSON
   * rather than the full generation pipeline (generateInitialBlueprint /
   * generateBuildPlan) — createDeployment only reads `.version` off each,
   * it never inspects their content, so a real generation run would be
   * disproportionate setup cost for these tests.
   */
  async function seedProjectWithGeneration() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });

    const blueprint = await db.blueprint.create({
      data: {
        projectId: project.id,
        version: 1,
        schemaVersion: "1.0",
        validationStatus: "VALID",
        createdByUserId: owner.id,
      },
    });
    const buildPlan = await db.buildPlan.create({
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

    return { owner, project, blueprint, buildPlan };
  }

  async function passQualityGate(actorUserId: string, projectId: string) {
    await setTruthStatus(actorUserId, projectId, {
      subjectKey: "quality.gate",
      subjectLabel: "Quality Gate for the generated product",
      status: "IMPLEMENTED",
      rationale: "Test fixture: quality gate marked passing directly.",
    });
  }

  describe("createDeployment", () => {
    it("throws NoGenerationToDeployError when the project has no Blueprint or Build Plan yet", async () => {
      const owner = await registerUser({ email: "owner@example.com", password: "password123" });
      const org = await createOrganization({ name: "Empty Co", ownerUserId: owner.id });
      const project = await createProject({
        organizationId: org.id,
        name: "Empty App",
        createdByUserId: owner.id,
      });

      await expect(createDeployment(owner.id, project.id, "DEVELOPMENT")).rejects.toBeInstanceOf(
        NoGenerationToDeployError,
      );
    });

    it("succeeds for a non-production environment without requiring the Quality Gate", async () => {
      const { owner, project } = await seedProjectWithGeneration();

      const deployment = await createDeployment(owner.id, project.id, "DEVELOPMENT");

      expect(deployment.status).toBe("SUCCEEDED");
      expect(deployment.environment).toBe("DEVELOPMENT");
      expect(deployment.blueprintVersion).toBe(1);
      expect(deployment.buildPlanVersion).toBe(1);
      expect(deployment.providerDeploymentId).toMatch(/^mock_deploy_/);

      const evidence = await listEvidence(owner.id, project.id, {
        subjectKey: "deployment.development",
      });
      expect(evidence).toHaveLength(1);
      expect(evidence[0]?.result).toContain("succeeded");
    });

    it("blocks a production deployment when the Quality Gate has not passed", async () => {
      const { owner, project } = await seedProjectWithGeneration();

      await expect(createDeployment(owner.id, project.id, "PRODUCTION")).rejects.toBeInstanceOf(
        ProductionDeploymentBlockedError,
      );

      const deployments = await listDeployments(owner.id, project.id, "PRODUCTION");
      expect(deployments).toHaveLength(0);
    });

    it("allows a production deployment once the Quality Gate has passed", async () => {
      const { owner, project } = await seedProjectWithGeneration();
      await passQualityGate(owner.id, project.id);

      const deployment = await createDeployment(owner.id, project.id, "PRODUCTION");

      expect(deployment.status).toBe("SUCCEEDED");
      expect(deployment.environment).toBe("PRODUCTION");
    });

    it("denies access to a non-member", async () => {
      const { project } = await seedProjectWithGeneration();
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });

      await expect(createDeployment(outsider.id, project.id, "DEVELOPMENT")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("getActiveDeployment / listDeployments", () => {
    it("returns the newest SUCCEEDED deployment for the environment, scoped per environment", async () => {
      const { owner, project } = await seedProjectWithGeneration();

      const dev1 = await createDeployment(owner.id, project.id, "DEVELOPMENT");
      const dev2 = await createDeployment(owner.id, project.id, "DEVELOPMENT");
      const preview1 = await createDeployment(owner.id, project.id, "PREVIEW");

      const activeDev = await getActiveDeployment(owner.id, project.id, "DEVELOPMENT");
      const activePreview = await getActiveDeployment(owner.id, project.id, "PREVIEW");

      expect(activeDev?.id).toBe(dev2.id);
      expect(activePreview?.id).toBe(preview1.id);

      const allDev = await listDeployments(owner.id, project.id, "DEVELOPMENT");
      expect(allDev.map((d) => d.id).sort()).toEqual([dev1.id, dev2.id].sort());
    });

    it("returns null when no deployment has succeeded yet for that environment", async () => {
      const { owner, project } = await seedProjectWithGeneration();

      const active = await getActiveDeployment(owner.id, project.id, "STAGING");

      expect(active).toBeNull();
    });
  });

  describe("rollbackDeployment", () => {
    it("marks the current deployment ROLLED_BACK and makes the previous one active again", async () => {
      const { owner, project } = await seedProjectWithGeneration();
      const first = await createDeployment(owner.id, project.id, "STAGING");
      const second = await createDeployment(owner.id, project.id, "STAGING");

      const rolledBackTo = await rollbackDeployment(owner.id, project.id, "STAGING");

      expect(rolledBackTo.id).toBe(first.id);

      const current = await db.deployment.findUnique({ where: { id: second.id } });
      expect(current?.status).toBe("ROLLED_BACK");

      const active = await getActiveDeployment(owner.id, project.id, "STAGING");
      expect(active?.id).toBe(first.id);
    });

    it("throws NoPreviousDeploymentToRollBackToError when there is nothing to roll back", async () => {
      const { owner, project } = await seedProjectWithGeneration();

      await expect(rollbackDeployment(owner.id, project.id, "STAGING")).rejects.toBeInstanceOf(
        NoPreviousDeploymentToRollBackToError,
      );
    });

    it("throws NoPreviousDeploymentToRollBackToError when only one deployment exists", async () => {
      const { owner, project } = await seedProjectWithGeneration();
      await createDeployment(owner.id, project.id, "STAGING");

      await expect(rollbackDeployment(owner.id, project.id, "STAGING")).rejects.toBeInstanceOf(
        NoPreviousDeploymentToRollBackToError,
      );
    });

    it("does not re-run the deployment provider on rollback", async () => {
      const { owner, project } = await seedProjectWithGeneration();
      const first = await createDeployment(owner.id, project.id, "STAGING");
      await createDeployment(owner.id, project.id, "STAGING");

      const rolledBackTo = await rollbackDeployment(owner.id, project.id, "STAGING");

      // Same row, same providerDeploymentId as the original successful
      // deploy — rollback is a record transition, not a new attempt.
      expect(rolledBackTo.providerDeploymentId).toBe(first.providerDeploymentId);
      const allDeployments = await listDeployments(owner.id, project.id, "STAGING");
      expect(allDeployments).toHaveLength(2);
    });
  });
});
