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

// The exact founder-supplied HomeBase description that exposed the
// semantic-hollowing defect (D-0065, execution/architecture/
// SEMANTIC_PRODUCT_COMPILER_REPORT.md; execution/final-audit/
// homebase-defect-evidence.json preserves the original, pre-repair output
// as historical evidence — this file is the repair's regression test, run
// under the default mock provider, the same configuration the founder
// used). Quoted verbatim, not paraphrased, for the same reason
// official-demonstration.integration.test.ts quotes Master Spec §56
// verbatim: the point is to honestly test what this exact input produces.
const HOMEBASE_IDEA =
  "HomeBase is a shared household management app that helps busy families organize their daily lives in one place. Family members can manage chores, shared grocery lists, household expenses, appointments, schedules, and rewards. Parents can assign one-time or recurring chores, set deadlines, track completion, and create rewards. Children have a simple view where they can see responsibilities, complete tasks, track progress, and view earned rewards. The app includes a family dashboard showing what needs attention today, upcoming appointments, overdue tasks, grocery needs, and recent household activity.";

describe("HomeBase semantic-hollowing defect regression (D-0065)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({
      email: "founder@homebase.example",
      password: "password123",
    });
    const org = await createOrganization({ name: "HomeBase Inc", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "HomeBase",
      createdByUserId: owner.id,
    });
    return { owner, project };
  }

  it("extracts more than one actor from the description, under the default mock provider", async () => {
    const { owner, project } = await seedProject();

    const { semanticModel } = await generateProductIntelligence(
      owner.id,
      project.id,
      HOMEBASE_IDEA,
    );

    const actorNames = (semanticModel.actors as Array<{ name: string }>).map((a) => a.name);
    // Before the repair, nothing in this pipeline ever distinguished
    // Parent from Child — this is the direct, minimal proof that
    // Impact-Analysis-category-only extraction has been replaced with
    // something that reads the actual sentence structure.
    expect(actorNames.length).toBeGreaterThan(1);
  });

  it("produces a Blueprint with more than the single generic customer role", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, HOMEBASE_IDEA);

    const { blueprint } = await generateApplication(owner.id, project.id);

    const roles = blueprint.roles as string[];
    // The original defect: roles was unconditionally ["customer"] for this
    // exact description, because "role"/"permission"/"access control"
    // never appear verbatim in it (execution/final-audit/
    // homebase-defect-evidence.json, stage4_blueprint.roles).
    expect(roles.length).toBeGreaterThan(1);
  });

  it("produces at least one domain-specific data model, not only the generic Record placeholder", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, HOMEBASE_IDEA);

    const { blueprint } = await generateApplication(owner.id, project.id);

    const dataModelNames = (blueprint.dataModels as Array<{ name: string }>).map((m) => m.name);
    // The original defect: dataModels was unconditionally [{name:"Record",
    // fields:["id","status","createdAt"]}] — a single generic placeholder,
    // regardless of how many distinct entities (chores, grocery lists,
    // expenses, appointments, schedules, rewards) the description named.
    const hasDomainSpecificModel = dataModelNames.some(
      (name) => name !== "Record" && name !== "Payment",
    );
    expect(hasDomainSpecificModel).toBe(true);
  });

  it("discloses low-confidence semantic extraction in the Blueprint's assumptions, honestly, under the mock provider", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, HOMEBASE_IDEA);

    const { blueprint } = await generateApplication(owner.id, project.id);

    const assumptions = blueprint.assumptions as string[];
    expect(assumptions.some((a) => a.includes("Semantic extraction identified"))).toBe(true);
    // Never silently claims certainty for a deterministic-fallback-mode
    // extraction (Part 6: "if live AI is unavailable... show the
    // limitation truthfully").
    expect(assumptions.some((a) => a.includes("low-confidence"))).toBe(true);
  });

  it("still passes the Quality Gate — richer content is not less structurally sound than the generic baseline", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, HOMEBASE_IDEA);
    await generateApplication(owner.id, project.id);

    const result = await runQualityGate(owner.id, project.id);

    expect(result.passed).toBe(true);
  });

  it("records generationMetadata.basedOnSemanticModelVersion, so a Blueprint is traceable back to the extraction that produced it", async () => {
    const { owner, project } = await seedProject();
    const { semanticModel } = await generateProductIntelligence(
      owner.id,
      project.id,
      HOMEBASE_IDEA,
    );

    const { blueprint } = await generateApplication(owner.id, project.id);

    expect(
      (blueprint.generationMetadata as { basedOnSemanticModelVersion?: number })
        .basedOnSemanticModelVersion,
    ).toBe(semanticModel.version);
  });
});
