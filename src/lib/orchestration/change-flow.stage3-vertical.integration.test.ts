// @vitest-environment node
//
// Stage 3 (D-0081/D-0082), implementation-order step 12: a full vertical
// slice proof. Steps 1-11 each proved their own mechanism in isolation
// (edgeType migration, Graph Projector, Impact Analysis consumer, Quality
// Gate check, Memory-Update) — this file proves the whole chain works
// together, end to end, through the same public beginChangeFlow/
// runQualityGate surface a real caller would use: describe an idea, make a
// real edit that populates the graph, make a second edit whose impact the
// graph actually resolves, then confirm the Quality Gate discloses the
// graph's real state and Memory recorded real history for both applied
// edits — architecture proposal Section 13.1/13.2's "Complete Workflow
// Chains".
//
// Uses the same IMPACT_ANALYSIS_MODE=graph env-caching workaround as
// change-flow.graph-impact.integration.test.ts (see that file's own header
// comment for the full ESM module-evaluation-order explanation).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { getKnowledgeGraph } from "@/lib/product/product-knowledge";
import { listProductMemoryEntries } from "@/lib/product/product-memory";
import { runQualityGate } from "@/lib/generation/quality-gate";
import { respondToChangeSetDecision } from "./change-flow";
import type { beginChangeFlow as BeginChangeFlow } from "./change-flow";

describe("Stage 3 vertical slice — idea to graph to impact to quality gate to memory", () => {
  const ORIGINAL_MODE = process.env.IMPACT_ANALYSIS_MODE;

  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterEach(() => {
    if (ORIGINAL_MODE === undefined) {
      delete process.env.IMPACT_ANALYSIS_MODE;
    } else {
      process.env.IMPACT_ANALYSIS_MODE = ORIGINAL_MODE;
    }
    vi.resetModules();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function beginChangeFlowInGraphMode(
    ...args: Parameters<typeof BeginChangeFlow>
  ): ReturnType<typeof BeginChangeFlow> {
    process.env.IMPACT_ANALYSIS_MODE = "graph";
    vi.resetModules();
    const { beginChangeFlow } = await import("./change-flow");
    return beginChangeFlow(...args);
  }

  it("carries a real idea through generation, graph projection, graph-based impact enrichment, Quality Gate disclosure, and Memory-Update", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "PayNow Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "PayNow",
      createdByUserId: owner.id,
    });

    // Step 1: describe the idea. No Blueprint yet, no graph yet — only
    // Product State/Semantic Model (existing, unchanged behavior).
    const ideaResult = await beginChangeFlowInGraphMode(
      owner.id,
      project.id,
      "PayNow helps small businesses collect payment from customers through a simple checkout " +
        "process. Customers can submit their payment details and complete the workflow.",
    );
    expect(ideaResult.intent.type).toBe("describe_idea");
    // describe_idea already creates REQUIREMENT nodes (existing behavior,
    // unrelated to Stage 3) — but no edges yet, since edges are only
    // produced by the Graph Projector during Blueprint generation
    // (steps 4-6), which hasn't run yet.
    const graphAfterIdea = await getKnowledgeGraph(owner.id, project.id);
    expect(graphAfterIdea.nodes.every((n) => n.type === "REQUIREMENT")).toBe(true);
    expect(graphAfterIdea.edges).toEqual([]);

    // Step 2: a real edit that introduces a new category ("Add a database of
    // customer records" — the same trigger this codebase's existing tests
    // already rely on) — Change Set applies immediately (non-consequential),
    // regenerating Blueprint + Build Plan for the FIRST time, which is what
    // actually projects the graph (blueprint-generator.ts's own wiring,
    // steps 4-6). The idea's own monetization language (payment/checkout)
    // is already in the accumulated Semantic Model, so this first real
    // generation produces the full Checkout/Payment/Pay relationship set.
    const firstEdit = await beginChangeFlowInGraphMode(
      owner.id,
      project.id,
      "Add a database of customer records.",
    );
    expect(firstEdit.changeSet?.status).toBe("APPLIED");
    expect(firstEdit.changeSet?.resultingBlueprintVersion).toBe(1);

    const graph = await getKnowledgeGraph(owner.id, project.id);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);

    // Step 3: Memory-Update recorded real history for the first applied edit.
    const historyAfterFirst = await listProductMemoryEntries(owner.id, project.id, {
      type: "HISTORY",
    });
    expect(historyAfterFirst).toHaveLength(1);
    expect(historyAfterFirst[0]?.content).toContain("Add a database of customer records.");

    // Step 4: the Quality Gate's 13th check (step 10) reads the real
    // GRAPH_PROJECTION evidence step 2 just produced.
    const qualityResult = await runQualityGate(owner.id, project.id);
    const graphCheck = qualityResult.checks.find(
      (c) => c.name === "Product Knowledge Graph relationships were projected for this generation",
    );
    expect(graphCheck?.passed).toBe(true);
    expect(graphCheck?.details).toMatch(/^\d+ of \d+ candidate relationships projected\.$/);

    // Step 5: a second edit whose own text resolves, via the now-populated
    // graph, to a real node — proving Impact Analysis (steps 7-9) actually
    // consumes what the Graph Projector (steps 4-6) actually produced, not
    // a synthetic fixture. disclosureTier stays keyword-based (unchanged);
    // "payment" is a monetization keyword, so this edit is itself
    // CONSEQUENTIAL and its Change Set stays PENDING until approved — the
    // Decision's impact is nonetheless already enriched with real graph
    // data at this point, since that enrichment happens before the
    // approval gate (change-flow.ts's own ordering).
    const secondEdit = await beginChangeFlowInGraphMode(
      owner.id,
      project.id,
      "Update the payment process.",
    );
    expect(secondEdit.intent.type).toBe("edit_request");
    expect(secondEdit.changeSet?.status).toBe("PENDING");
    const impact = secondEdit.decision.impact as {
      graph?: { directlyAffected: string[]; transitivelyAffected: string[] };
    };
    expect(impact.graph).toBeDefined();
    expect(impact.graph!.directlyAffected).toContain("Checkout");
    expect(impact.graph!.transitivelyAffected).toContain("Pay");

    // Step 6: approving the pending Change Set applies it — Memory-Update
    // then records real history for this second applied edit too, so two
    // real, distinct HISTORY entries now exist, one per applied edit, never
    // merged or overwritten (append-only per Master Spec §11).
    await respondToChangeSetDecision(owner.id, project.id, secondEdit.decision.id, {
      approve: true,
    });
    const historyAfterSecond = await listProductMemoryEntries(owner.id, project.id, {
      type: "HISTORY",
    });
    expect(historyAfterSecond).toHaveLength(2);
    expect(historyAfterSecond[1]?.content).toContain("Update the payment process.");
  });
});
