import { describe, expect, it } from "vitest";
import {
  describeImpactCoverage,
  fuzzyMatchNodes,
  topologicalOrder,
  traverseFromNode,
  type GraphImpactAnalysisResult,
  type ImpactedNode,
} from "./impact-analysis";
import type { ProductKnowledgeEdge, ProductKnowledgeNode } from "@/generated/prisma/client";

function node(id: string, type: ProductKnowledgeNode["type"], label: string): ProductKnowledgeNode {
  return {
    id,
    projectId: "p1",
    type,
    label,
    data: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: ProductKnowledgeEdge["edgeType"],
): ProductKnowledgeEdge {
  return {
    id,
    projectId: "p1",
    sourceNodeId,
    targetNodeId,
    edgeType,
    provenance: null,
    createdAt: new Date(2026, 0, 1),
  };
}

describe("fuzzyMatchNodes", () => {
  const nodes = [
    node("1", "DATA_MODEL", "Subscription"),
    node("2", "WORKFLOW", "Checkout"),
    node("4", "DATA_MODEL", "Payment"),
    node("5", "ACTION", "Pay"),
  ];

  it("matches an exact label case-insensitively", () => {
    expect(fuzzyMatchNodes(nodes, "subscription").map((n) => n.id)).toEqual(["1"]);
  });

  it("matches via whole-word set containment either direction", () => {
    // "Checkout" (a whole word) is contained in the target's word set
    // {checkout, screen} — a real match: a founder saying "the checkout
    // screen" should resolve to the Checkout node.
    expect(fuzzyMatchNodes(nodes, "Checkout screen").map((n) => n.id)).toEqual(["2"]);
  });

  it("does NOT match a word that is merely a character-substring prefix of a different whole word (the real bug this test guards against)", () => {
    // Found live during Stage 3 implementation: character-substring
    // matching made "Payment" (the search term) falsely match "Pay" (a
    // genuinely different ACTION node), since "pay" is a substring prefix
    // of "payment". Word-boundary matching must not repeat this — "pay"
    // and "payment" are different whole words, never a match either
    // direction.
    expect(fuzzyMatchNodes(nodes, "Payment").map((n) => n.id)).toEqual(["4"]);
    expect(fuzzyMatchNodes(nodes, "Pay").map((n) => n.id)).toEqual(["5"]);
    expect(fuzzyMatchNodes(nodes, "Check").map((n) => n.id)).toEqual([]);
  });

  it("returns multiple matches when a label is genuinely ambiguous", () => {
    const ambiguousNodes = [
      ...nodes,
      node("3", "WORKFLOW", "Payment Settings"),
      node("6", "DATA_MODEL", "Payment Method"),
    ];
    // "Payment" (one word) is a subset of {payment}, {payment, settings},
    // and {payment, method} — genuinely three-way ambiguous, correctly
    // returns all three.
    const matches = fuzzyMatchNodes(ambiguousNodes, "Payment");
    expect(matches.map((n) => n.id).sort()).toEqual(["3", "4", "6"]);
  });

  it("returns nothing for an empty or unmatched target", () => {
    expect(fuzzyMatchNodes(nodes, "")).toEqual([]);
    expect(fuzzyMatchNodes(nodes, "NoSuchThing")).toEqual([]);
  });
});

describe("traverseFromNode", () => {
  it("finds direct DEPENDS_ON neighbors in reverse (what depends on this)", () => {
    const edges = [edge("e1", "screen", "model", "DEPENDS_ON")];
    const result = traverseFromNode(edges, "model");
    expect(result.directNodeIds).toEqual(new Set(["screen"]));
  });

  it("traverses TRIGGERS in both directions", () => {
    const edges = [edge("e1", "action", "workflow", "TRIGGERS")];
    expect(traverseFromNode(edges, "action").directNodeIds).toEqual(new Set(["workflow"]));
    expect(traverseFromNode(edges, "workflow").directNodeIds).toEqual(new Set(["action"]));
  });

  it("traverses CONTAINS in both directions", () => {
    const edges = [edge("e1", "screen", "action", "CONTAINS")];
    expect(traverseFromNode(edges, "screen").directNodeIds).toEqual(new Set(["action"]));
    expect(traverseFromNode(edges, "action").directNodeIds).toEqual(new Set(["screen"]));
  });

  it("separates direct (depth 1) from transitive (depth 2+) neighbors", () => {
    const edges = [
      edge("e1", "a", "b", "TRIGGERS"),
      edge("e2", "b", "c", "TRIGGERS"),
    ];
    const result = traverseFromNode(edges, "a");
    expect(result.directNodeIds).toEqual(new Set(["b"]));
    expect(result.transitiveNodeIds).toEqual(new Set(["c"]));
  });

  it("never revisits the same node twice (cycle protection)", () => {
    const edges = [
      edge("e1", "a", "b", "TRIGGERS"),
      edge("e2", "b", "a", "TRIGGERS"),
    ];
    const result = traverseFromNode(edges, "a");
    expect(result.directNodeIds).toEqual(new Set(["b"]));
    expect(result.transitiveNodeIds).toEqual(new Set());
  });

  it("respects the fan-out limit and reports truncation", () => {
    const edges = Array.from({ length: 60 }, (_, i) => edge(`e${i}`, "hub", `leaf${i}`, "TRIGGERS"));
    const result = traverseFromNode(edges, "hub", 3, 50);
    expect(result.truncated).toBe(true);
    expect(result.directNodeIds.size).toBeLessThanOrEqual(50);
  });

  it("respects the depth bound", () => {
    const edges = [
      edge("e1", "a", "b", "TRIGGERS"),
      edge("e2", "b", "c", "TRIGGERS"),
      edge("e3", "c", "d", "TRIGGERS"),
      edge("e4", "d", "e", "TRIGGERS"),
    ];
    const result = traverseFromNode(edges, "a", 2);
    expect([...result.directNodeIds, ...result.transitiveNodeIds].sort()).toEqual(["b", "c"]);
  });
});

describe("topologicalOrder", () => {
  it("orders a simple linear dependency chain", () => {
    const edges = [edge("e1", "a", "b", "DEPENDS_ON")];
    const result = topologicalOrder(["a", "b"], edges);
    expect(result.cycleWarning).toBeNull();
    expect(result.order.indexOf("a")).toBeLessThan(result.order.indexOf("b"));
  });

  it("detects a cycle formed by mixing DEPENDS_ON and TRIGGERS and reports it, never silently ordering", () => {
    const edges = [
      edge("e1", "workflowA", "workflowB", "TRIGGERS"),
      edge("e2", "workflowB", "dataModel", "DEPENDS_ON"),
      edge("e3", "dataModel", "workflowA", "DEPENDS_ON"),
    ];
    const result = topologicalOrder(["workflowA", "workflowB", "dataModel"], edges);
    expect(result.order).toEqual([]);
    expect(result.cycleWarning).toContain("Cyclic dependency detected");
  });

  it("ignores edges outside the given node-id set", () => {
    const edges = [
      edge("e1", "a", "b", "DEPENDS_ON"),
      edge("e2", "a", "outside", "DEPENDS_ON"),
    ];
    const result = topologicalOrder(["a", "b"], edges);
    expect(result.cycleWarning).toBeNull();
    expect(result.order.sort()).toEqual(["a", "b"]);
  });
});

describe("describeImpactCoverage", () => {
  const baseResult: GraphImpactAnalysisResult = {
    directlyAffected: [],
    transitivelyAffected: [],
    businessImpacts: [],
    technicalImpacts: [],
    requiredTests: [],
    requiredApprovals: [],
    uncertainImpacts: [],
    missingGraphCoverage: false,
    recommendedExecutionOrder: [],
    cyclicDependencyWarning: null,
    rollbackConcerns: [],
    hasAnyRecordedEdge: false,
  };

  it('returns the coverage-incomplete message when missingGraphCoverage is true', () => {
    expect(describeImpactCoverage({ ...baseResult, missingGraphCoverage: true })).toBe(
      "Impact cannot be determined because graph coverage is incomplete.",
    );
  });

  it('returns "No impact exists." when the node has real coverage but genuinely no affected neighbors', () => {
    expect(describeImpactCoverage({ ...baseResult, hasAnyRecordedEdge: true })).toBe(
      "No impact exists.",
    );
  });

  it('returns "No impact was found." (the hedged claim) when the node has zero recorded edges at all', () => {
    expect(describeImpactCoverage({ ...baseResult, hasAnyRecordedEdge: false })).toBe(
      "No impact was found.",
    );
  });

  it("names the real affected nodes when impact is found, regardless of hasAnyRecordedEdge", () => {
    const affected: ImpactedNode = {
      nodeId: "n1",
      type: "WORKFLOW",
      label: "Checkout",
      relationshipPath: [],
      confidenceState: "implemented",
    };
    expect(
      describeImpactCoverage({ ...baseResult, directlyAffected: [affected], hasAnyRecordedEdge: true }),
    ).toBe("Changing this also affects: Checkout.");
  });
});
