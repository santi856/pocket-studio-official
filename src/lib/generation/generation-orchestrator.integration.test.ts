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
import { listEvents } from "@/lib/product/events";
import { getLatestTruthStatus } from "@/lib/product/truth-status";
import { generateApplication } from "./generation-orchestrator";

describe("generateApplication", () => {
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

  it("generates a Blueprint and a READY Build Plan for a simple idea, marking status GENERATED", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    const result = await generateApplication(owner.id, project.id);

    expect(result.status).toBe("GENERATED");
    expect(result.blueprint.version).toBe(1);
    expect(result.buildPlan.version).toBe(1);
    expect(result.buildPlan.basedOnBlueprintVersion).toBe(1);
  });

  it("marks status BLOCKED, never silently GENERATED, when the Build Plan has blockers", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits.",
    );

    const result = await generateApplication(owner.id, project.id);

    expect(result.status).toBe("BLOCKED");
  });

  it("syncs Truth Status for generation.full_stack_web_app to this project's real outcome", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    await generateApplication(owner.id, project.id);

    const status = await getLatestTruthStatus(
      owner.id,
      project.id,
      "generation.full_stack_web_app",
    );
    expect(status?.status).toBe("IMPLEMENTED");
  });

  it("syncs Truth Status to BLOCKED, with a rationale citing the real blockers, when generation is blocked", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits.",
    );

    await generateApplication(owner.id, project.id);

    const status = await getLatestTruthStatus(
      owner.id,
      project.id,
      "generation.full_stack_web_app",
    );
    expect(status?.status).toBe("BLOCKED");
    expect(status?.rationale).toContain("blocked");
  });

  it("records a GENERATION_COMPLETED event", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    await generateApplication(owner.id, project.id);

    const events = await listEvents(owner.id, project.id, { type: "GENERATION_COMPLETED" });
    expect(events).toHaveLength(1);
  });

  it("is idempotent-but-append-only: calling it twice creates new Blueprint/Build Plan versions", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    await generateApplication(owner.id, project.id);
    const second = await generateApplication(owner.id, project.id);

    expect(second.blueprint.version).toBe(2);
    expect(second.buildPlan.version).toBe(2);
  });

  it("denies generation for an actor without project access", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(generateApplication(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
