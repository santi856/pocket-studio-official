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
import { getKnowledgeGraph } from "@/lib/product/product-knowledge";
import { listEvidence } from "@/lib/product/evidence";

/**
 * Stage 3 (D-0081/D-0082), implementation-order step 6: proves the Graph
 * Projector, wired into the real generation path, produces the exact
 * expected edge set for a real, end-to-end generation — not just that its
 * pure functions behave correctly in isolation (graph-projector.test.ts).
 */
describe("Graph Projector — wired into real generation", () => {
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
    const org = await createOrganization({ name: "PayNow Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "PayNow",
      createdByUserId: owner.id,
    });
    return { owner, project };
  }

  it("projects real DEPENDS_ON, CONTAINS, and TRIGGERS edges for a description matching monetization + actions + workflows", async () => {
    const { owner, project } = await seedProject();

    // Deliberately hits three ImpactCategory keyword sets at once: "payment"
    // (monetization), "submit" (actions), "process"/"workflow" (workflows) —
    // exercising all three approved edge types in one real generation.
    await generateProductIntelligence(
      owner.id,
      project.id,
      "PayNow helps small businesses collect payment from customers through a simple checkout " +
        "process. Customers can submit their payment details and complete the workflow.",
    );

    const blueprint = await generateInitialBlueprint(owner.id, project.id);
    expect(blueprint.validationStatus).toBe("VALID");

    const graph = await getKnowledgeGraph(owner.id, project.id);
    const nodesByLabel = new Map(graph.nodes.map((n) => [n.label, n]));
    const edgeDescriptions = graph.edges.map((edge) => {
      const source = graph.nodes.find((n) => n.id === edge.sourceNodeId);
      const target = graph.nodes.find((n) => n.id === edge.targetNodeId);
      return `${edge.edgeType}: ${source?.label} -> ${target?.label}`;
    });

    // DEPENDS_ON: Checkout screen depends on the Payment data model
    // (deriveDataDependencies, unchanged, reused as-is).
    expect(nodesByLabel.has("Checkout")).toBe(true);
    expect(nodesByLabel.has("Payment")).toBe(true);
    expect(edgeDescriptions).toContain("DEPENDS_ON: Checkout -> Payment");

    // CONTAINS: the Pay action is declared onScreen: "Checkout" in the
    // monetization category template.
    expect(nodesByLabel.has("Pay")).toBe(true);
    expect(edgeDescriptions).toContain("CONTAINS: Checkout -> Pay");

    // TRIGGERS: the Submit action (from the "actions" category) declares
    // triggersWorkflow: "Primary Workflow" — reachable here because this
    // description also matched the "workflows" category, so a real
    // WORKFLOW node named "Primary Workflow" exists to resolve against.
    expect(nodesByLabel.has("Submit")).toBe(true);
    expect(nodesByLabel.has("Primary Workflow")).toBe(true);
    expect(edgeDescriptions).toContain("TRIGGERS: Submit -> Primary Workflow");

    // Every edge created carries real provenance, never a bare, unexplained row.
    for (const edge of graph.edges) {
      expect(edge.provenance).not.toBeNull();
    }

    // Evidence was recorded, disclosing exactly how many candidates were
    // projected — a real, itemized fact, not a silent success.
    const evidence = await listEvidence(owner.id, project.id, {
      subjectKey: "graph.relationships",
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.evidenceType).toBe("GRAPH_PROJECTION");
    expect(evidence[0]?.result).toMatch(/^\d+ of \d+ candidate relationships projected\.$/);
  });

  it("discloses, rather than fabricates, a candidate whose referenced category was not matched", async () => {
    const { owner, project } = await seedProject();

    // "Submit" (actions category) is matched, but nothing here matches the
    // "workflows" category — so no "Primary Workflow" node is ever created,
    // and the TRIGGERS candidate correctly cannot resolve.
    await generateProductIntelligence(
      owner.id,
      project.id,
      "ClickTrack helps teams log which button a user clicked. Users can submit a click event.",
    );

    await generateInitialBlueprint(owner.id, project.id);

    const graph = await getKnowledgeGraph(owner.id, project.id);
    expect(graph.nodes.some((n) => n.label === "Primary Workflow")).toBe(false);
    expect(graph.edges.some((e) => e.edgeType === "TRIGGERS")).toBe(false);

    const evidence = await listEvidence(owner.id, project.id, {
      subjectKey: "graph.relationships",
    });
    expect(evidence[0]?.limitations).toContain("TRIGGERS");
    expect(evidence[0]?.limitations).toContain("Primary Workflow");
  });

  it("does not fabricate CONTAINS/TRIGGERS edges for a category whose actions were never authored with pairing data", async () => {
    const { owner, project } = await seedProject();

    // "integrations" category's action ("Connect integration") is still a
    // bare string, deliberately un-paired — must produce zero CONTAINS/
    // TRIGGERS candidates for it, never a guessed relationship.
    await generateProductIntelligence(
      owner.id,
      project.id,
      "LinkUp helps teams connect to third-party services via a real integration.",
    );

    await generateInitialBlueprint(owner.id, project.id);

    const graph = await getKnowledgeGraph(owner.id, project.id);
    const connectActionNode = graph.nodes.find((n) => n.label === "Connect integration");
    expect(connectActionNode).toBeDefined();
    expect(
      graph.edges.some(
        (e) => e.sourceNodeId === connectActionNode?.id || e.targetNodeId === connectActionNode?.id,
      ),
    ).toBe(false);
  });
});
