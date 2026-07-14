// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateApplication } from "./generation-orchestrator";
import { runQualityGate } from "./quality-gate";
import { getLatestTruthStatus } from "@/lib/product/truth-status";

// Master Spec §54's exact required text, quoted verbatim — not a
// paraphrase or an embellished version, since the point of this test is to
// honestly report what the current deterministic pipeline produces from
// the literal official input, not from a friendlier hand-picked one.
const OFFICIAL_DEMONSTRATION_IDEA = "Build a premium booking app for mobile detailers.";

/**
 * P2-07 (Master Spec §56): "The first supported demonstration is: 'Build a
 * premium booking app for mobile detailers.'" This runs the exact official
 * sentence through the full generation pipeline (Product Intelligence →
 * Blueprint → Build Plan → Truth Status) end to end and verifies it
 * completes successfully.
 *
 * Honest scope note: §56 describes a rich, detailed demonstration product
 * (11 customer screens, 11 owner screens, 11 data types — Services,
 * Packages, Availability, Memberships, etc.). The deterministic
 * category-template pipeline built in P2-01/P2-03
 * (blueprint-templates.ts) derives its output from Impact Analysis
 * keyword categories, not domain understanding — from this one sentence
 * alone (no "database", "deposit", "workflow", etc. keywords) it produces
 * only the base recommended screens (Home, Browse) and no business logic.
 * It does get a generic "Record" data model, defaulted (not
 * category-matched) since Home is unconditionally a list-view screen that
 * needs a real data binding for every product, not only ones whose idea
 * text happens to use data-category keywords (Level 3 review round 3
 * finding 1). This test intentionally does NOT assert §56's full
 * customer/owner/data lists are produced, because they are not — asserting
 * otherwise would misrepresent what this system currently does. Closing
 * that gap honestly requires either a deliberately expanded, reusable
 * domain-template vocabulary (not a one-off hardcode of this one sentence)
 * or real AI-backed generation (Phase 3, §61) — recorded as a known
 * limitation, not silently implied to be complete.
 */
describe("official Phase 2 demonstration product (Master Spec §56)", () => {
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
      name: "Detailer Booking App",
      createdByUserId: owner.id,
    });
    return { owner, project };
  }

  it("generates successfully end to end from the exact official demonstration sentence", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, OFFICIAL_DEMONSTRATION_IDEA);

    const result = await generateApplication(owner.id, project.id);

    expect(result.status).toBe("GENERATED");
    expect(result.blueprint.validationStatus).toBe("VALID");
    expect(result.buildPlan.planStatus).toBe("READY");
    expect(result.buildPlan.blockers).toEqual([]);
  });

  it("produces the base recommended screens today, honestly not §56's full customer/owner screen lists", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, OFFICIAL_DEMONSTRATION_IDEA);

    const { blueprint } = await generateApplication(owner.id, project.id);

    expect(blueprint.screens).toEqual(["Home", "Browse"]);
    expect(blueprint.dataModels).toEqual([
      { name: "Record", fields: ["id", "status", "createdAt"] },
    ]);
  });

  it("passes the Quality Gate's data-binding checks — Home/Browse are real list-view screens bound to the defaulted Record data model (regression, Level 3 review round 3 finding 1)", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, OFFICIAL_DEMONSTRATION_IDEA);
    await generateApplication(owner.id, project.id);

    const result = await runQualityGate(owner.id, project.id);

    const dataBoundCheck = result.checks.find(
      (check) => check.name === "List-view screens are wired to a real data dependency",
    );
    expect(dataBoundCheck?.passed).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("syncs Truth Status honestly, extracting the correct target customer from the official sentence", async () => {
    const { owner, project } = await seedProject();
    const result = await generateProductIntelligence(
      owner.id,
      project.id,
      OFFICIAL_DEMONSTRATION_IDEA,
    );
    expect(result.productDNA.targetUsers).toEqual(["mobile detailers"]);

    await generateApplication(owner.id, project.id);

    const status = await getLatestTruthStatus(
      owner.id,
      project.id,
      "generation.full_stack_web_app",
    );
    expect(status?.status).toBe("IMPLEMENTED");
  });
});
