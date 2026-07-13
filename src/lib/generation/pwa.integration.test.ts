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
import { generateApplication } from "./generation-orchestrator";
import { getLatestTruthStatus } from "@/lib/product/truth-status";
import { syncOutputTargetStatus } from "./pwa";

describe("syncOutputTargetStatus", () => {
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

  it("marks web and pwa MISSING when no Blueprint exists yet", async () => {
    const { owner, project } = await seedProject();

    await syncOutputTargetStatus(owner.id, project.id);

    const web = await getLatestTruthStatus(owner.id, project.id, "output.web");
    const pwa = await getLatestTruthStatus(owner.id, project.id, "output.pwa");
    expect(web?.status).toBe("MISSING");
    expect(pwa?.status).toBe("MISSING");
  });

  it("marks web and pwa IMPLEMENTED, and ios/android NOT_EVALUATED, once a Blueprint exists", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);

    await syncOutputTargetStatus(owner.id, project.id);

    const web = await getLatestTruthStatus(owner.id, project.id, "output.web");
    const pwa = await getLatestTruthStatus(owner.id, project.id, "output.pwa");
    const ios = await getLatestTruthStatus(owner.id, project.id, "output.ios");
    const android = await getLatestTruthStatus(owner.id, project.id, "output.android");

    expect(web?.status).toBe("IMPLEMENTED");
    expect(pwa?.status).toBe("IMPLEMENTED");
    expect(ios?.status).toBe("NOT_EVALUATED");
    expect(android?.status).toBe("NOT_EVALUATED");
  });

  it("is synced automatically as part of generateApplication, marking web/pwa IMPLEMENTED", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    await generateApplication(owner.id, project.id);

    const web = await getLatestTruthStatus(owner.id, project.id, "output.web");
    const pwa = await getLatestTruthStatus(owner.id, project.id, "output.pwa");
    expect(web?.status).toBe("IMPLEMENTED");
    expect(pwa?.status).toBe("IMPLEMENTED");
    expect(web?.rationale).toContain("not built, signed, or deployed");
  });

  it("denies syncing for an actor without project access", async () => {
    const { owner, project } = await seedProject();
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    await expect(syncOutputTargetStatus(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
