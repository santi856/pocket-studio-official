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
import { getLatestTruthStatus } from "@/lib/product/truth-status";
import { NoBlueprintForMobileProjectError, generateMobileProject } from "./mobile";

describe("generateMobileProject", () => {
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

  it("throws NoBlueprintForMobileProjectError when no Blueprint exists yet", async () => {
    const { owner, project } = await seedProject();

    await expect(generateMobileProject(owner.id, project.id)).rejects.toBeInstanceOf(
      NoBlueprintForMobileProjectError,
    );
  });

  it("generates a real, validated project scaffold and syncs output.ios/output.android to IMPLEMENTED", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const result = await generateMobileProject(owner.id, project.id);

    expect(result.architecture).toBe("react-native-expo");
    expect(result.validation.valid).toBe(true);
    expect(result.files.map((f) => f.path)).toContain("App.tsx");

    const ios = await getLatestTruthStatus(owner.id, project.id, "output.ios");
    const android = await getLatestTruthStatus(owner.id, project.id, "output.android");
    expect(ios?.status).toBe("IMPLEMENTED");
    expect(android?.status).toBe("IMPLEMENTED");
    expect(ios?.rationale).toContain("no native build");
  });

  it("tracks basedOnBlueprintVersion against the real latest Blueprint", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    const result = await generateMobileProject(owner.id, project.id);

    expect(result.basedOnBlueprintVersion).toBe(blueprint.version);
  });

  it("denies mobile project generation for an actor without project access", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(generateMobileProject(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
