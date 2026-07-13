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
import { listEvents } from "@/lib/product/events";
import { NoBlueprintError, generateBuildPlan } from "./build-planner";
import { getLatestBuildPlan, listBuildPlanVersions } from "./build-plan";

describe("generateBuildPlan", () => {
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

  it("throws NoBlueprintError when the project has no Blueprint yet", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    await expect(generateBuildPlan(owner.id, project.id)).rejects.toBeInstanceOf(NoBlueprintError);
  });

  it("marks a plan READY for a simple idea with no unresolved consequential decisions or unsafe capabilities", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    expect(plan.version).toBe(1);
    expect(plan.planStatus).toBe("READY");
    expect(plan.blockers).toEqual([]);
    expect(plan.basedOnBlueprintVersion).toBe(1);
  });

  it("marks a plan BLOCKED when the Blueprint has an unresolved consequential interaction decision", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    expect(plan.planStatus).toBe("BLOCKED");
    expect((plan.blockers as string[]).some((b) => b.includes("consequential decision"))).toBe(
      true,
    );
  });

  it("derives screen order, navigation graph, and a component tree built from Component Registry primitives", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    expect(plan.screenOrder).toEqual(blueprint.screens);
    const navigationGraph = plan.navigationGraph as Array<{ from: string; to: string }>;
    expect(navigationGraph.every((edge) => edge.from === (blueprint.screens as string[])[0])).toBe(
      true,
    );

    const componentStructure = plan.componentStructure as Record<string, { type: string }>;
    for (const screen of blueprint.screens as string[]) {
      expect(componentStructure[screen]?.type).toBe("Screen");
    }
  });

  it("derives implementation phases in dependency order, gated on Blueprint content", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records and a workflow for scheduling.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    const phases = plan.implementationPhases as Array<{ name: string; items: string[] }>;
    const phaseNames = phases.map((p) => p.name);
    expect(phaseNames).toContain("Data layer");
    expect(phaseNames).toContain("Screens & navigation");
    expect(phaseNames).toContain("Workflows & business logic");
    expect(phaseNames[phaseNames.length - 1]).toBe("Testing & evidence");

    const dependencies = plan.dependencies as Record<string, string[]>;
    expect(dependencies["Data layer"]).toEqual([]);
    expect(dependencies["Screens & navigation"]).toEqual(["Data layer"]);
  });

  it("derives tests from each screen's required interaction states", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    expect((plan.tests as string[]).length).toBeGreaterThan(0);
    expect((plan.tests as string[]).some((t) => t.includes('"loading"'))).toBe(true);
  });

  it("derives tests from a workflow's own interaction contract, not just a generic completion string (P2-EXIT fix)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records and a workflow for scheduling.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);
    const tests = plan.tests as string[];

    expect(tests).toContain("Primary Workflow: end-to-end workflow completion test.");
    // Every multi-step-workflow requires loading/error/success — these must
    // now be reflected as real, per-state workflow tests, not silently
    // dropped between Blueprint generation (which computes the contract)
    // and the Build Plan (which previously never consumed it).
    expect(tests).toContain('Primary Workflow: verify the "loading" state.');
    expect(tests).toContain('Primary Workflow: verify the "error" state.');
    expect(tests).toContain('Primary Workflow: verify the "success" state.');
  });

  it("labels planning as deterministic, never as AI-authored planning", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    expect(plan.generationMetadata).toMatchObject({
      generatedBy: "deterministic-build-planner-v1",
    });
  });

  it("records a BUILD_PLAN_VERSION_CREATED event", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);

    await generateBuildPlan(owner.id, project.id);

    const events = await listEvents(owner.id, project.id, { type: "BUILD_PLAN_VERSION_CREATED" });
    expect(events).toHaveLength(1);
  });

  it("is append-only and always tracks the latest Blueprint version it was based on", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);
    await generateInitialBlueprint(owner.id, project.id);

    const first = await generateBuildPlan(owner.id, project.id);
    const second = await generateBuildPlan(owner.id, project.id);

    expect(first.basedOnBlueprintVersion).toBe(2);
    expect(second.version).toBe(2);

    const versions = await listBuildPlanVersions(owner.id, project.id);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const latest = await getLatestBuildPlan(owner.id, project.id);
    expect(latest?.version).toBe(2);
  });

  it("blocks the plan when the Blueprint's Feasibility Report lists an unrecognized capability", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    // Wipe the registry after Blueprint generation so its stored Feasibility
    // Report is honestly "unrecognized" rather than mocking the shape.
    await db.capabilityRegistryEntry.deleteMany();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    expect(plan.planStatus).toBe("BLOCKED");
    expect(
      (plan.blockers as string[]).some((b) => b.includes("no Supported Capability Registry entry")),
    ).toBe(true);
  });

  it("denies plan generation for an actor without project access", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(generateBuildPlan(outsider.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("names a Form's Inputs after the bound data model's real fields, excluding system-managed ones", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const plan = await generateBuildPlan(owner.id, project.id);

    const componentStructure = plan.componentStructure as Record<
      string,
      {
        children?: Array<{
          type: string;
          children?: Array<{ type: string; props?: { name?: string } }>;
        }>;
      }
    >;
    const checkout = componentStructure["Checkout"];
    const form = checkout?.children?.find((child) => child.type === "Form");
    const inputNames = form?.children
      ?.filter((child) => child.type === "Input")
      .map((child) => child.props?.name);

    expect(inputNames).toEqual(["amountCents", "status"]);
  });
});
