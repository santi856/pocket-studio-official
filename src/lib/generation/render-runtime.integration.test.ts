// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "./blueprint-generator";
import { generateBuildPlan } from "./build-planner";
import { createGeneratedRecord } from "./generated-records";
import {
  NoBuildPlanError,
  ScreenHasNoDataDependencyError,
  loadScreenData,
  submitScreenRecord,
} from "./render-runtime";

describe("render-runtime", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithBuildPlan() {
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
    await generateInitialBlueprint(owner.id, project.id);
    const plan = await generateBuildPlan(owner.id, project.id);
    return { owner, project, plan };
  }

  it("throws NoBuildPlanError when the project has no Build Plan yet", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });

    await expect(loadScreenData(owner.id, project.id, "Home")).rejects.toBeInstanceOf(
      NoBuildPlanError,
    );
  });

  it("returns an error state for a screen the Build Plan has no data dependency for", async () => {
    const { owner, project } = await seedProjectWithBuildPlan();

    const state = await loadScreenData(owner.id, project.id, "Nonexistent");

    expect(state.status).toBe("error");
  });

  it("returns an empty state for a data-dependent screen with no records yet", async () => {
    const { owner, project } = await seedProjectWithBuildPlan();

    const state = await loadScreenData(owner.id, project.id, "Home");

    expect(state).toMatchObject({ status: "empty", modelKey: "Record" });
  });

  it("returns a success state with real records once one has been created", async () => {
    const { owner, project } = await seedProjectWithBuildPlan();
    await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    const state = await loadScreenData(owner.id, project.id, "Home");

    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.records).toHaveLength(1);
      expect(state.modelKey).toBe("Record");
    }
  });

  it("submits a real record through the same data dependency loadScreenData reads from", async () => {
    const { owner, project } = await seedProjectWithBuildPlan();

    const record = await submitScreenRecord(owner.id, project.id, "Home", {
      id: "1",
      status: "open",
      createdAt: "2026-01-01",
    });

    expect(record.modelKey).toBe("Record");
    const state = await loadScreenData(owner.id, project.id, "Home");
    expect(state.status).toBe("success");
  });

  it("throws ScreenHasNoDataDependencyError when submitting to a screen with no data dependency", async () => {
    const { owner, project } = await seedProjectWithBuildPlan();

    await expect(
      submitScreenRecord(owner.id, project.id, "Nonexistent", { id: "1" }),
    ).rejects.toBeInstanceOf(ScreenHasNoDataDependencyError);
  });
});
