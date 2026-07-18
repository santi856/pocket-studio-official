import { describe, expect, it } from "vitest";
import {
  deriveCandidateEdges,
  isApprovedEdgeTriple,
  wouldCreateDependsOnCycle,
} from "./graph-projector";

describe("isApprovedEdgeTriple", () => {
  it("approves the 5 governed triples", () => {
    expect(isApprovedEdgeTriple("SCREEN", "ACTION", "CONTAINS")).toBe(true);
    expect(isApprovedEdgeTriple("WORKFLOW", "ACTION", "CONTAINS")).toBe(true);
    expect(isApprovedEdgeTriple("ACTION", "WORKFLOW", "TRIGGERS")).toBe(true);
    expect(isApprovedEdgeTriple("WORKFLOW", "DATA_MODEL", "DEPENDS_ON")).toBe(true);
    expect(isApprovedEdgeTriple("SCREEN", "DATA_MODEL", "DEPENDS_ON")).toBe(true);
  });

  it("rejects the reverse direction of an approved triple", () => {
    expect(isApprovedEdgeTriple("ACTION", "SCREEN", "CONTAINS")).toBe(false);
    expect(isApprovedEdgeTriple("WORKFLOW", "ACTION", "TRIGGERS")).toBe(false);
    expect(isApprovedEdgeTriple("DATA_MODEL", "WORKFLOW", "DEPENDS_ON")).toBe(false);
  });

  it("rejects a node-type pair with no approved edge type at all", () => {
    expect(isApprovedEdgeTriple("REQUIREMENT", "PERMISSION", "CONTAINS")).toBe(false);
    expect(isApprovedEdgeTriple("SCREEN", "SCREEN", "DEPENDS_ON")).toBe(false);
  });

  it("rejects VERIFIED_BY entirely — deferred to Stage 3+1, not approved for this slice", () => {
    expect(isApprovedEdgeTriple("SCREEN", "EVIDENCE", "VERIFIED_BY" as never)).toBe(false);
    expect(isApprovedEdgeTriple("ACTION", "TEST", "VERIFIED_BY" as never)).toBe(false);
  });
});

describe("wouldCreateDependsOnCycle", () => {
  it("allows a candidate edge when no existing edges exist", () => {
    expect(wouldCreateDependsOnCycle([], { sourceId: "a", targetId: "b" })).toBe(false);
  });

  it("rejects a direct self-loop", () => {
    expect(wouldCreateDependsOnCycle([], { sourceId: "a", targetId: "a" })).toBe(true);
  });

  it("rejects a candidate that would close a 2-node cycle (A->B exists, B->A proposed)", () => {
    const existing = [{ sourceId: "a", targetId: "b" }];
    expect(wouldCreateDependsOnCycle(existing, { sourceId: "b", targetId: "a" })).toBe(true);
  });

  it("rejects a candidate that would close a longer transitive cycle (A->B->C exists, C->A proposed)", () => {
    const existing = [
      { sourceId: "a", targetId: "b" },
      { sourceId: "b", targetId: "c" },
    ];
    expect(wouldCreateDependsOnCycle(existing, { sourceId: "c", targetId: "a" })).toBe(true);
  });

  it("allows a candidate that extends the graph without closing a cycle", () => {
    const existing = [
      { sourceId: "a", targetId: "b" },
      { sourceId: "b", targetId: "c" },
    ];
    expect(wouldCreateDependsOnCycle(existing, { sourceId: "c", targetId: "d" })).toBe(false);
  });

  it("allows two independent chains that never intersect", () => {
    const existing = [
      { sourceId: "a", targetId: "b" },
      { sourceId: "x", targetId: "y" },
    ];
    expect(wouldCreateDependsOnCycle(existing, { sourceId: "b", targetId: "x" })).toBe(false);
  });

  it("respects the maxDepth bound — a cycle beyond maxDepth is not detected (documented limit, not a defect)", () => {
    // A chain of 25 edges: n0->n1->n2->...->n24
    const existing = Array.from({ length: 25 }, (_, i) => ({
      sourceId: `n${i}`,
      targetId: `n${i + 1}`,
    }));
    // n25 -> n0 would close a 26-hop cycle, beyond the default maxDepth of 20.
    expect(wouldCreateDependsOnCycle(existing, { sourceId: "n25", targetId: "n0" }, 20)).toBe(
      false,
    );
    // The same case with a sufficient maxDepth correctly detects it.
    expect(wouldCreateDependsOnCycle(existing, { sourceId: "n25", targetId: "n0" }, 30)).toBe(true);
  });
});

describe("deriveCandidateEdges", () => {
  it("derives both a DEPENDS_ON and a CONTAINS candidate for the monetization category alone", () => {
    const candidates = deriveCandidateEdges({
      categories: ["monetization"],
      screens: ["Checkout"],
      dataModels: [{ name: "Payment", fields: ["id", "amountCents", "status", "createdAt"] }],
    });

    expect(candidates).toContainEqual(
      expect.objectContaining({
        edgeType: "DEPENDS_ON",
        sourceLabel: "Checkout",
        targetLabel: "Payment",
      }),
    );
    expect(candidates).toContainEqual(
      expect.objectContaining({
        edgeType: "CONTAINS",
        sourceLabel: "Checkout",
        targetLabel: "Pay",
      }),
    );
  });

  it("derives a TRIGGERS candidate for the actions category alone, independent of whether workflows was matched", () => {
    const candidates = deriveCandidateEdges({
      categories: ["actions"],
      screens: [],
      dataModels: [],
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        edgeType: "TRIGGERS",
        sourceLabel: "Submit",
        targetLabel: "Primary Workflow",
      }),
    ]);
  });

  it("produces zero candidates when no categories are matched", () => {
    expect(deriveCandidateEdges({ categories: [], screens: [], dataModels: [] })).toEqual([]);
  });

  it("produces no CONTAINS/TRIGGERS candidate for a category whose actions are still bare strings", () => {
    const candidates = deriveCandidateEdges({
      categories: ["integrations"],
      screens: [],
      dataModels: [],
    });

    expect(candidates.filter((c) => c.edgeType !== "DEPENDS_ON")).toEqual([]);
  });
});
