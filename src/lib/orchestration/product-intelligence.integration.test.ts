// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { listProductMemoryEntries } from "@/lib/product/product-memory";
import { listKnowledgeNodes } from "@/lib/product/product-knowledge";
import { listEvents } from "@/lib/product/events";
import { listLatestTruthStatuses } from "@/lib/product/truth-status";
import { updateUnitEconomicsAssumptions } from "@/lib/product/product-state";
import { defaultUnitEconomicsAssumptions } from "./unit-economics";
import type { UnitEconomicsAssumptions } from "./unit-economics";
import { generateProductIntelligence } from "./product-intelligence";

describe("generateProductIntelligence", () => {
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

  it("persists a Product State version with structured intelligence and a Feasibility Report", async () => {
    const { owner, project } = await seedProject();

    const result = await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    expect(result.productState.version).toBe(1);
    expect(result.productState.originalIdea).toBe(
      "Build a premium booking app for mobile detailers.",
    );
    expect(result.productState.productIntelligence).toMatchObject({
      targetCustomer: "mobile detailers",
    });
    expect(result.feasibilityReport.unrecognizedCapabilityKeys).toEqual([]);
  });

  it("persists a Product DNA version carrying the extracted target customer", async () => {
    const { owner, project } = await seedProject();

    const result = await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    expect(result.productDNA.version).toBe(1);
    expect(result.productDNA.targetUsers).toEqual(["mobile detailers"]);
  });

  it("creates a Requirement knowledge node for every derived requirement", async () => {
    const { owner, project } = await seedProject();

    const result = await generateProductIntelligence(
      owner.id,
      project.id,
      "Add appointment deposits and monthly memberships.",
    );

    const nodes = await listKnowledgeNodes(owner.id, project.id, { type: "REQUIREMENT" });
    expect(nodes).toHaveLength(result.requirements.length);
  });

  it("records a FACT memory entry for the original idea and OPEN_QUESTION entries for gaps", async () => {
    const { owner, project } = await seedProject();

    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    const facts = await listProductMemoryEntries(owner.id, project.id, { type: "FACT" });
    const questions = await listProductMemoryEntries(owner.id, project.id, {
      type: "OPEN_QUESTION",
    });

    expect(facts.some((f) => f.content.includes("Build a booking app."))).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
  });

  it("syncs Truth Status from the Feasibility Report and records a PRODUCT_STATE_VERSION_CREATED event", async () => {
    const { owner, project } = await seedProject();

    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    const statuses = await listLatestTruthStatuses(owner.id, project.id);
    const webAppStatus = statuses.find((s) => s.subjectKey === "generation.full_stack_web_app");
    expect(webAppStatus?.status).toBe("PLANNED");
    expect(webAppStatus?.evidenceRef).toBeTruthy();

    const events = await listEvents(owner.id, project.id, {
      type: "PRODUCT_STATE_VERSION_CREATED",
    });
    expect(events).toHaveLength(1);
  });

  it("flags an unrecognized capability instead of assuming support when the registry is unseeded", async () => {
    const { owner, project } = await seedProject();
    // Wipe the registry this test just seeded in beforeEach, to exercise
    // the "registry has no entry" path honestly rather than mocking it.
    await db.capabilityRegistryEntry.deleteMany();

    const result = await generateProductIntelligence(owner.id, project.id, "Build a booking app.");

    expect(result.feasibilityReport.unrecognizedCapabilityKeys).toContain(
      "generation.full_stack_web_app",
    );
    expect(result.feasibilityReport.overallSupported).toBe(false);
  });

  it("carries forward a customer's edited unit-economics assumptions on a later call, never silently resetting them", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await updateUnitEconomicsAssumptions(owner.id, project.id, {
      ...defaultUnitEconomicsAssumptions(),
      price: { value: 75, source: "user_provided" },
    });

    const result = await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app. Add appointment deposits.",
    );

    expect(
      (result.productState.unitEconomicsAssumptions as UnitEconomicsAssumptions).price.value,
    ).toBe(75);
  });
});
