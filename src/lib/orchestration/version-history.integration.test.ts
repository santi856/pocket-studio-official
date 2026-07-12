// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { generateProductIntelligence } from "./product-intelligence";
import { generateInitialBlueprint } from "@/lib/generation/blueprint-generator";
import { generateBuildPlan } from "@/lib/generation/build-planner";
import { beginChangeFlow } from "./change-flow";
import { listEvents } from "@/lib/product/events";
import {
  BlueprintVersionNotFoundError,
  getProjectVersionHistory,
  previewBlueprintRestore,
  restoreBlueprintVersion,
  validateBlueprintRestore,
} from "./version-history";

describe("version history and restore", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    return { owner, project };
  }

  describe("getProjectVersionHistory", () => {
    it("assembles Product State, Blueprint, Build Plan, and Change Set entries in one chronological list", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(
        owner.id,
        project.id,
        "Build a booking app with a database of customer records.",
      );
      await generateInitialBlueprint(owner.id, project.id);
      await generateBuildPlan(owner.id, project.id);
      await beginChangeFlow(owner.id, project.id, "Add a workflow for scheduling.");

      const history = await getProjectVersionHistory(owner.id, project.id);

      expect(history.some((e) => e.kind === "PRODUCT_STATE")).toBe(true);
      expect(history.some((e) => e.kind === "BLUEPRINT")).toBe(true);
      expect(history.some((e) => e.kind === "BUILD_PLAN")).toBe(true);
      expect(history.some((e) => e.kind === "CHANGE_SET")).toBe(true);
      // Newest first.
      for (let i = 1; i < history.length; i++) {
        expect(history[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
          history[i]!.createdAt.getTime(),
        );
      }
    });

    it("denies access for an actor without project membership", async () => {
      const { owner, project } = await seedProject();
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

      await expect(getProjectVersionHistory(outsider.id, project.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("previewBlueprintRestore", () => {
    it("computes a real diff between the target and current Blueprint versions", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      await generateInitialBlueprint(owner.id, project.id); // v1: Home, Browse
      await beginChangeFlow(owner.id, project.id, "Add a database of customer records."); // v2: adds Record data model

      const diff = await previewBlueprintRestore(owner.id, project.id, 1);

      expect(diff.currentVersion).toBe(2);
      expect(diff.targetVersion).toBe(1);
      expect(diff.dataModelsRemoved).toContain("Record");
      expect(diff.dataModelsAdded).toEqual([]);
    });

    it("throws BlueprintVersionNotFoundError for a version that does not exist", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      await generateInitialBlueprint(owner.id, project.id);

      await expect(previewBlueprintRestore(owner.id, project.id, 99)).rejects.toBeInstanceOf(
        BlueprintVersionNotFoundError,
      );
    });

    it("throws BlueprintVersionNotFoundError when the project has no Blueprint at all", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

      await expect(previewBlueprintRestore(owner.id, project.id, 1)).rejects.toBeInstanceOf(
        BlueprintVersionNotFoundError,
      );
    });
  });

  describe("validateBlueprintRestore", () => {
    it("confirms a valid target version is still structurally valid", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      await generateInitialBlueprint(owner.id, project.id);

      const result = await validateBlueprintRestore(owner.id, project.id, 1);

      expect(result.status).toBe("VALID");
    });
  });

  describe("restoreBlueprintVersion", () => {
    it("creates a new top version with the target's content, never mutating history in between", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      await generateInitialBlueprint(owner.id, project.id); // v1: no data models
      await beginChangeFlow(owner.id, project.id, "Add a database of customer records."); // v2: has Record

      const restored = await restoreBlueprintVersion(owner.id, project.id, 1);

      expect(restored.version).toBe(3);
      expect(restored.dataModels).toEqual([]);
      expect(restored.generationMetadata).toMatchObject({ restoredFromVersion: 1 });

      // v1 and v2 remain exactly as they were.
      const diff = await previewBlueprintRestore(owner.id, project.id, 2);
      expect(diff.currentVersion).toBe(3);
    });

    it("throws BlueprintVersionNotFoundError restoring a version that does not exist", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      await generateInitialBlueprint(owner.id, project.id);

      await expect(restoreBlueprintVersion(owner.id, project.id, 99)).rejects.toBeInstanceOf(
        BlueprintVersionNotFoundError,
      );
    });

    it("records a BLUEPRINT_RESTORED event", async () => {
      const { owner, project } = await seedProject();
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      await generateInitialBlueprint(owner.id, project.id);

      await restoreBlueprintVersion(owner.id, project.id, 1);

      const events = await listEvents(owner.id, project.id, { type: "BLUEPRINT_RESTORED" });
      expect(events).toHaveLength(1);
    });

    it("denies restore for an actor without project access", async () => {
      const { owner, project } = await seedProject();
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });
      await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
      await generateInitialBlueprint(owner.id, project.id);

      await expect(restoreBlueprintVersion(outsider.id, project.id, 1)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});
