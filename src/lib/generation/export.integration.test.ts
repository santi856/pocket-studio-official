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
import { seedPlans } from "@/lib/billing/seed-plans";
import { createSubscription } from "@/lib/billing/subscription";
import { generateInitialBlueprint } from "./blueprint-generator";
import { generateBuildPlan } from "./build-planner";
import { createGeneratedRecord } from "./generated-records";
import { createGeneratedAppUser } from "./generated-app-users";
import { exportProject } from "./export";

describe("exportProject", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
    await seedPlans();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    // Free/Explore (the default) does not permit export (P3-02
    // entitlements enforcement) — this file tests export *content*, not
    // billing, so it seeds a plan that permits it. Free/Explore's own
    // block is covered by src/lib/billing/entitlements.integration.test.ts.
    const subscription = await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { id: subscription.id },
      data: { planKey: "BUILDER" },
    });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    return { owner, project };
  }

  it("bundles Product State, Blueprint, and Build Plan when they exist", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    const bundle = await exportProject(owner.id, project.id);

    expect(bundle.project.name).toBe("Booking App");
    expect(bundle.productState?.version).toBe(1);
    expect(bundle.blueprint?.version).toBe(1);
    expect(bundle.buildPlan?.version).toBe(1);
    expect(bundle.exportVersion).toBe("1.0");
  });

  it("returns null for artifacts that do not exist yet, never fabricating placeholders", async () => {
    const { owner, project } = await seedProject();

    const bundle = await exportProject(owner.id, project.id);

    expect(bundle.productState).toBeNull();
    expect(bundle.blueprint).toBeNull();
    expect(bundle.buildPlan).toBeNull();
    expect(bundle.generatedRecords).toEqual([]);
  });

  it("records a real, queryable ExportRecord for every export attempt (Master Spec §61 production exports)", async () => {
    const { owner, project } = await seedProject();

    await exportProject(owner.id, project.id);
    await exportProject(owner.id, project.id);

    const records = await db.exportRecord.findMany({ where: { projectId: project.id } });
    expect(records).toHaveLength(2);
    expect(records[0]?.createdByUserId).toBe(owner.id);
    expect(records[0]?.exportVersion).toBe("1.0");
  });

  it("includes real generated records and generated-app users, never a password hash", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });
    await createGeneratedAppUser(owner.id, project.id, {
      email: "customer@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });

    const bundle = await exportProject(owner.id, project.id);

    expect(bundle.generatedRecords).toHaveLength(1);
    expect(bundle.generatedRecords[0]?.modelKey).toBe("Record");
    expect(bundle.generatedAppUsers).toHaveLength(1);
    expect(bundle.generatedAppUsers[0]?.email).toBe("customer@example.com");
    expect(bundle.generatedAppUsers[0]).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(bundle)).not.toContain("passwordHash");
  });

  it("discloses honestly that this is not a deployable package or a backup", async () => {
    const { owner, project } = await seedProject();

    const bundle = await exportProject(owner.id, project.id);

    expect(bundle.disclosures.some((d) => d.includes("not a deployable code package"))).toBe(true);
    expect(bundle.disclosures.some((d) => d.includes("password hashes"))).toBe(true);
  });

  it("denies export for an actor without project access", async () => {
    const { project } = await seedProject();
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(exportProject(outsider.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
