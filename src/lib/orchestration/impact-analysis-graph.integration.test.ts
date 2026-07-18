// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { generateProductIntelligence } from "./product-intelligence";
import { generateInitialBlueprint } from "@/lib/generation/blueprint-generator";
import { analyzeGraphImpact, describeImpactCoverage } from "./impact-analysis";

/**
 * Stage 3 (D-0081/D-0082), implementation-order step 8: proves
 * analyzeGraphImpact() against a real, populated graph — not just its pure
 * traversal/matching helpers in isolation (impact-analysis-graph.test.ts).
 */
describe("analyzeGraphImpact — wired against a real, populated graph", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedGeneratedProject(idea: string) {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "PayNow Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "PayNow",
      createdByUserId: owner.id,
    });
    await generateProductIntelligence(owner.id, project.id, idea);
    await generateInitialBlueprint(owner.id, project.id);
    return { owner, project };
  }

  const PAYNOW_IDEA =
    "PayNow helps small businesses collect payment from customers through a simple checkout " +
    "process. Customers can submit their payment details and complete the workflow.";

  it("finds real, directly and transitively affected nodes for a resolvable change target", async () => {
    const { owner, project } = await seedGeneratedProject(PAYNOW_IDEA);

    const result = await analyzeGraphImpact(owner.id, project.id, {
      changeTargetLabel: "Payment",
    });

    expect(result.missingGraphCoverage).toBe(false);
    // Payment (DATA_MODEL) <- DEPENDS_ON <- Checkout (SCREEN), direct.
    expect(result.directlyAffected.map((n) => n.label)).toContain("Checkout");
    // Checkout <- CONTAINS <- Pay (ACTION), transitive from Payment's perspective.
    expect(result.transitivelyAffected.map((n) => n.label)).toContain("Pay");
    expect(result.cyclicDependencyWarning).toBeNull();
    expect(describeImpactCoverage(result)).toContain("Checkout");
  });

  it('reports "Impact cannot be determined" for a target that resolves to nothing in the graph', async () => {
    const { owner, project } = await seedGeneratedProject(PAYNOW_IDEA);

    const result = await analyzeGraphImpact(owner.id, project.id, {
      changeTargetLabel: "SomethingThatWasNeverDescribed",
    });

    expect(result.missingGraphCoverage).toBe(true);
    expect(describeImpactCoverage(result)).toBe(
      "Impact cannot be determined because graph coverage is incomplete.",
    );
  });

  it('reports "No impact was found" (hedged) for a real node with zero recorded structural edges', async () => {
    const { owner, project } = await seedGeneratedProject(
      "LinkUp helps teams connect to third-party services via a real integration.",
    );

    // "Connect integration" is a real ACTION node (created by generation)
    // but has no CONTAINS/TRIGGERS/DEPENDS_ON edges at all — its category
    // template entry is still an un-paired bare string.
    const result = await analyzeGraphImpact(owner.id, project.id, {
      changeTargetLabel: "Connect integration",
    });

    expect(result.missingGraphCoverage).toBe(false);
    expect(result.directlyAffected).toEqual([]);
    expect(result.hasAnyRecordedEdge).toBe(false);
    expect(describeImpactCoverage(result)).toBe("No impact was found.");
  });

  it("produces a real topological execution order for the affected subgraph, with no cycle", async () => {
    const { owner, project } = await seedGeneratedProject(PAYNOW_IDEA);

    const result = await analyzeGraphImpact(owner.id, project.id, {
      changeTargetLabel: "Payment",
    });

    expect(result.cyclicDependencyWarning).toBeNull();
    expect(result.recommendedExecutionOrder.length).toBeGreaterThan(0);
  });

  it("denies graph impact analysis for an actor without project access (tenant isolation)", async () => {
    const { project } = await seedGeneratedProject(PAYNOW_IDEA);
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(
      analyzeGraphImpact(outsider.id, project.id, { changeTargetLabel: "Payment" }),
    ).rejects.toThrow();
  });
});
