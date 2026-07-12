// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "./blueprint-generator";
import { createBlueprintVersion, getLatestBlueprint } from "./blueprint";
import { createGeneratedRecord } from "./generated-records";
import {
  BlueprintVersionNotFoundForMigrationError,
  planDataModelMigration,
  recordMigrationPlanDecision,
} from "./migration-planning";

describe("migration planning", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithDataModel() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    const blueprint = await generateInitialBlueprint(owner.id, project.id); // v1: Record has id/status/createdAt
    return { owner, project, blueprint };
  }

  it("throws BlueprintVersionNotFoundForMigrationError for a version that does not exist", async () => {
    const { owner, project } = await seedProjectWithDataModel();

    await expect(planDataModelMigration(owner.id, project.id, 1, 99)).rejects.toBeInstanceOf(
      BlueprintVersionNotFoundForMigrationError,
    );
  });

  it("is not destructive when a field is removed but no records hold real data for it", async () => {
    const { owner, project, blueprint } = await seedProjectWithDataModel();

    // v2: Record loses "createdAt" — no records exist yet, so nothing to lose.
    await createBlueprintVersion(owner.id, project.id, {
      schemaVersion: blueprint.schemaVersion,
      productType: blueprint.productType,
      screens: blueprint.screens ?? undefined,
      dataModels: [{ name: "Record", fields: ["id", "status"] }],
      requirements: blueprint.requirements ?? undefined,
      roles: blueprint.roles ?? undefined,
      outputTargets: blueprint.outputTargets ?? undefined,
      validationStatus: "VALID",
    });

    const plan = await planDataModelMigration(owner.id, project.id, 1, 2);

    expect(plan.destructive).toBe(false);
    expect(plan.dataLossRisks).toEqual([]);
    expect(plan.backupRequirement).toContain("Not required");
  });

  it("detects real data loss when a removed field has real data in existing records", async () => {
    const { owner, project, blueprint } = await seedProjectWithDataModel();

    await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    // v2: Record loses "createdAt" — one record has real, non-null data there.
    await createBlueprintVersion(owner.id, project.id, {
      schemaVersion: blueprint.schemaVersion,
      productType: blueprint.productType,
      screens: blueprint.screens ?? undefined,
      dataModels: [{ name: "Record", fields: ["id", "status"] }],
      requirements: blueprint.requirements ?? undefined,
      roles: blueprint.roles ?? undefined,
      outputTargets: blueprint.outputTargets ?? undefined,
      validationStatus: "VALID",
    });

    const plan = await planDataModelMigration(owner.id, project.id, 1, 2);

    expect(plan.destructive).toBe(true);
    expect(plan.dataLossRisks[0]).toContain("Record.createdAt");
    expect(plan.dataLossRisks[0]).toContain("1 of 1");
    expect(plan.backupRequirement).toContain("REQUIRED");
  });

  it("notes compatibility requirements for newly added fields", async () => {
    const { owner, project, blueprint } = await seedProjectWithDataModel();

    await createBlueprintVersion(owner.id, project.id, {
      schemaVersion: blueprint.schemaVersion,
      productType: blueprint.productType,
      screens: blueprint.screens ?? undefined,
      dataModels: [{ name: "Record", fields: ["id", "status", "createdAt", "priority"] }],
      requirements: blueprint.requirements ?? undefined,
      roles: blueprint.roles ?? undefined,
      outputTargets: blueprint.outputTargets ?? undefined,
      validationStatus: "VALID",
    });

    const plan = await planDataModelMigration(owner.id, project.id, 1, 2);

    expect(plan.compatibilityNotes.some((note) => note.includes("Record.priority"))).toBe(true);
    expect(plan.destructive).toBe(false);
  });

  it("denies planning for an actor without project access", async () => {
    const { owner, project } = await seedProjectWithDataModel();
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    await createBlueprintVersion(owner.id, project.id, {
      schemaVersion: "1.0",
      productType: "web_application",
      dataModels: [],
      validationStatus: "VALID",
    });

    await expect(planDataModelMigration(outsider.id, project.id, 1, 2)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  describe("recordMigrationPlanDecision", () => {
    it("records a CONSEQUENTIAL decision for a destructive plan", async () => {
      const { owner, project, blueprint } = await seedProjectWithDataModel();
      await createGeneratedRecord(owner.id, project.id, {
        modelKey: "Record",
        data: { id: "1", status: "open", createdAt: "2026-01-01" },
      });
      await createBlueprintVersion(owner.id, project.id, {
        schemaVersion: blueprint.schemaVersion,
        productType: blueprint.productType,
        screens: blueprint.screens ?? undefined,
        dataModels: [{ name: "Record", fields: ["id", "status"] }],
        validationStatus: "VALID",
      });
      const plan = await planDataModelMigration(owner.id, project.id, 1, 2);

      const decision = await recordMigrationPlanDecision(owner.id, project.id, plan);

      expect(decision.disclosureTier).toBe("CONSEQUENTIAL");
    });

    it("records a ROUTINE decision for a non-destructive plan", async () => {
      const { owner, project, blueprint } = await seedProjectWithDataModel();
      await createBlueprintVersion(owner.id, project.id, {
        schemaVersion: blueprint.schemaVersion,
        productType: blueprint.productType,
        screens: blueprint.screens ?? undefined,
        dataModels: [{ name: "Record", fields: ["id", "status", "createdAt", "priority"] }],
        validationStatus: "VALID",
      });
      const plan = await planDataModelMigration(owner.id, project.id, 1, 2);

      const decision = await recordMigrationPlanDecision(owner.id, project.id, plan);

      expect(decision.disclosureTier).toBe("ROUTINE");
    });
  });

  it("provides a rollback plan referencing Blueprint restore", async () => {
    const { owner, project, blueprint } = await seedProjectWithDataModel();
    await createBlueprintVersion(owner.id, project.id, {
      schemaVersion: blueprint.schemaVersion,
      productType: blueprint.productType,
      dataModels: [],
      validationStatus: "VALID",
    });

    const plan = await planDataModelMigration(owner.id, project.id, 1, 2);

    expect(plan.rollbackPlan).toContain("restoreBlueprintVersion");
    const latest = await getLatestBlueprint(owner.id, project.id);
    expect(latest?.version).toBe(2);
  });
});
