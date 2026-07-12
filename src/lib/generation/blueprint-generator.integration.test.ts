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
import { NoProductStateError } from "@/lib/product/product-state";
import { listKnowledgeNodes } from "@/lib/product/product-knowledge";
import { listEvents } from "@/lib/product/events";
import { generateInitialBlueprint } from "./blueprint-generator";
import { getLatestBlueprint, listBlueprintVersions } from "./blueprint";
import type { InteractionContractMap } from "./interaction-contracts";

describe("generateInitialBlueprint", () => {
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

  it("throws NoProductStateError when the project has no Product State yet", async () => {
    const { owner, project } = await seedProject();

    await expect(generateInitialBlueprint(owner.id, project.id)).rejects.toBeInstanceOf(
      NoProductStateError,
    );
  });

  it("generates a valid Blueprint version 1 from an idea with no detected categories beyond the base recommendation", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    expect(blueprint.version).toBe(1);
    expect(blueprint.validationStatus).toBe("VALID");
    expect(blueprint.validationErrors).toEqual([]);
    expect(blueprint.schemaVersion).toBe("1.0");
    expect(blueprint.screens).toEqual(["Home", "Browse"]);
    expect(blueprint.roles).toEqual(["customer"]);
    expect(blueprint.targetUsers).toEqual(["mobile detailers"]);
    expect(blueprint.basedOnProductStateVersion).toBe(1);
    expect(blueprint.basedOnProductDnaVersion).toBe(1);
  });

  it("derives owner role, data models, and monetization notes from a richer idea's categories", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits, staff roles, and a database of customer records.",
    );

    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    expect(blueprint.roles).toEqual(["customer", "owner"]);
    expect(blueprint.dataModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Record" }),
        expect.objectContaining({ name: "Payment" }),
      ]),
    );
    expect(blueprint.monetization).toEqual(
      expect.arrayContaining(["Collect payment as part of the primary workflow."]),
    );
    expect(blueprint.ownerOperations).toEqual(
      expect.arrayContaining(["Manage records", "View activity"]),
    );
  });

  it("labels generation as deterministic, never as AI-authored design", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    expect(blueprint.generationMetadata).toMatchObject({
      generatedBy: "deterministic-template-generator-v1",
    });
    expect(blueprint.assumptions).toEqual(
      expect.arrayContaining([
        "Blueprint generated deterministically from Impact Analysis categories, not real design intelligence.",
      ]),
    );
  });

  it("flags open decisions when target users or a primary data entity are unknown", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    expect(blueprint.openDecisions).toEqual(
      expect.arrayContaining([
        "Confirm the primary target user/customer for this product.",
        "Confirm the primary data entity this product needs to persist.",
      ]),
    );
  });

  it("creates SCREEN, WORKFLOW, DATA_MODEL, and ACTION knowledge nodes matching the generated Blueprint", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits and a workflow for scheduling.",
    );

    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    const screenNodes = await listKnowledgeNodes(owner.id, project.id, { type: "SCREEN" });
    const workflowNodes = await listKnowledgeNodes(owner.id, project.id, { type: "WORKFLOW" });
    const dataModelNodes = await listKnowledgeNodes(owner.id, project.id, { type: "DATA_MODEL" });

    expect(screenNodes.map((n) => n.label).sort()).toEqual(
      (blueprint.screens as string[]).slice().sort(),
    );
    expect(workflowNodes.length).toBeGreaterThan(0);
    expect(dataModelNodes.length).toBeGreaterThan(0);
  });

  it("records a BLUEPRINT_VERSION_CREATED event", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    await generateInitialBlueprint(owner.id, project.id);

    const events = await listEvents(owner.id, project.id, { type: "BLUEPRINT_VERSION_CREATED" });
    expect(events).toHaveLength(1);
  });

  it("is append-only: a second generation call creates version 2, preserving version 1", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    await generateInitialBlueprint(owner.id, project.id);
    const second = await generateInitialBlueprint(owner.id, project.id);

    expect(second.version).toBe(2);

    const versions = await listBlueprintVersions(owner.id, project.id);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    const latest = await getLatestBlueprint(owner.id, project.id);
    expect(latest?.version).toBe(2);
  });

  it("marks a Blueprint INVALID when its output targets are not currently supported for generation", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    // Force an unsupported output target directly on Product State, the same
    // way a future capability-driven change could — the generator must
    // honestly mark the resulting Blueprint INVALID rather than proceeding
    // as if it were buildable.
    const latestState = await db.productState.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
    });
    await db.productState.update({
      where: { id: latestState!.id },
      data: { outputTargets: ["ios"] },
    });

    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    expect(blueprint.validationStatus).toBe("INVALID");
    expect(blueprint.validationErrors).toEqual(
      expect.arrayContaining(['Output target "ios" is not currently supported for generation.']),
    );
  });

  it("attaches an interaction contract to every screen and workflow, requiring confirmation before a payment", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with appointment deposits and a workflow for scheduling.",
    );

    const blueprint = await generateInitialBlueprint(owner.id, project.id);

    const contracts = blueprint.interactionContracts as Record<
      string,
      { patterns: string[]; requiredStates: string[] }
    >;
    for (const screen of blueprint.screens as string[]) {
      expect(contracts[screen]).toBeDefined();
      expect(contracts[screen]!.requiredStates.length).toBeGreaterThan(0);
    }
    expect(contracts.Checkout?.patterns).toEqual(
      expect.arrayContaining(["form-submission", "destructive-action"]),
    );
    expect(contracts.Checkout?.requiredStates).toContain("confirmation");
    expect(contracts["workflow:Primary Workflow"]?.patterns).toContain("multi-step-workflow");
  });

  it("would mark a Blueprint INVALID if a screen's interaction contract were dropped (e.g. by a future Change Set edit)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    const blueprint = await generateInitialBlueprint(owner.id, project.id);
    const screens = blueprint.screens as string[];
    const contracts = { ...(blueprint.interactionContracts as Record<string, unknown>) };
    const [firstScreen] = screens;
    delete contracts[firstScreen!];

    const { validateBlueprint } = await import("./blueprint-validation");
    const result = validateBlueprint({
      schemaVersion: blueprint.schemaVersion,
      productType: blueprint.productType,
      roles: blueprint.roles as string[],
      screens,
      outputTargets: blueprint.outputTargets as string[],
      dataModels: blueprint.dataModels as Array<{ name: string; fields: string[] }>,
      requirements: blueprint.requirements as unknown[],
      interactionContracts: contracts as unknown as InteractionContractMap,
    });

    expect(result.status).toBe("INVALID");
    expect(result.errors).toContain(`Screen "${firstScreen}" has no interaction contract.`);
  });

  it("denies generation for an actor without project access", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(generateInitialBlueprint(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
