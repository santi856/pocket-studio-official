import "server-only";
import { getKnowledgeGraph } from "@/lib/product/product-knowledge";
import type {
  ProductKnowledgeEdge,
  ProductKnowledgeEdgeType,
  ProductKnowledgeNode,
  ProductKnowledgeNodeType,
} from "@/generated/prisma/client";

/**
 * The categories a change can affect (Master Spec §14). Phase 1 has no
 * generated workflows/screens/data models to analyze against yet (that is
 * Phase 2's Blueprint Engine output) — this is a deterministic, keyword-
 * based *foundation* that gives every request a structured impact shape,
 * to be replaced by real graph-based analysis over Product Knowledge
 * relationships once Phase 2 populates them.
 */
export type ImpactCategory =
  | "requirements"
  | "workflows"
  | "screens"
  | "actions"
  | "data"
  | "permissions"
  | "integrations"
  | "businessLogic"
  | "monetization"
  | "costs"
  | "security"
  | "privacy"
  | "governance"
  | "testing"
  | "launchStatus";

export type ImpactAnalysisResult = {
  categories: ImpactCategory[];
  /** True if this touches a Master Spec §4.2 consequential category. */
  consequential: boolean;
  rationale: string[];
};

// Master Spec §4.2 consequential categories, narrowed to the subset a
// keyword scan can plausibly detect in Phase 1 (payments/subscriptions,
// sensitive data, production/publishing actions). The remaining
// consequential categories (children, biometrics, health/finance/legal,
// etc.) require real product/business understanding this mock-era
// analyzer cannot provide — those surface later via the Requirements
// Engine and governance profile (P1-06/P1-08), not keyword matching.
const CONSEQUENTIAL_CATEGORIES: ReadonlySet<ImpactCategory> = new Set<ImpactCategory>([
  "monetization",
  "security",
  "privacy",
  "governance",
]);

const CATEGORY_KEYWORDS: Record<ImpactCategory, readonly string[]> = {
  requirements: ["require", "requirement", "must support", "should support"],
  workflows: ["workflow", "flow", "process", "step by step"],
  screens: ["screen", "page", "view", "ui"],
  actions: ["button", "action", "click", "submit", "tap"],
  data: ["data model", "database", "field", "record", "schema"],
  permissions: ["permission", "role", "access control", "who can"],
  integrations: ["integrate", "integration", "connect to", "webhook", "third-party", "api"],
  businessLogic: ["business rule", "logic", "calculation", "workflow rule"],
  monetization: [
    "payment",
    "deposit",
    "subscription",
    "pricing",
    "price",
    "membership",
    "billing",
    "charge",
    "fee",
    "refund",
  ],
  costs: ["cost", "expense", "budget", "margin"],
  security: ["password", "login", "authentication", "authorization", "security", "encrypt"],
  privacy: ["personal data", "pii", "privacy", "consent", "delete my data", "gdpr", "ccpa"],
  governance: ["compliance", "regulation", "legal", "policy", "terms of service", "law"],
  testing: ["test", "qa", "quality assurance"],
  launchStatus: ["launch", "deploy", "release", "publish", "go live", "submit to app store"],
};

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Plain substring matching false-positives on short keywords embedded in
 * unrelated words — e.g. "ui" inside "build" — so every keyword requires a
 * word boundary on its left edge. Deliberately *not* anchored on the right
 * too: that would miss ordinary inflections ("deposit" -> "deposits",
 * "membership" -> "memberships"), which matter more for this deterministic
 * foundation than the rarer risk of over-matching a suffix.
 */
function textContainsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}`, "i").test(text);
}

export function analyzeImpact(requestText: string): ImpactAnalysisResult {
  const categories: ImpactCategory[] = [];
  const rationale: string[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [ImpactCategory, readonly string[]]
  >) {
    const matched = keywords.find((keyword) => textContainsKeyword(requestText, keyword));
    if (matched) {
      categories.push(category);
      rationale.push(`Matched "${matched}" → ${category}`);
    }
  }

  const consequential = categories.some((category) => CONSEQUENTIAL_CATEGORIES.has(category));

  return { categories, consequential, rationale };
}

// ---------------------------------------------------------------------------
// Stage 3 (D-0081/D-0082, STAGE_2_ARCHITECTURE_PROPOSAL.md §20). A new,
// separate graph-traversal analysis, alongside — never replacing —
// analyzeImpact() above (Migration Plan Phase 2: feature-flagged, existing
// keyword classifier untouched). Reads the Product Knowledge Graph's real
// CONTAINS/TRIGGERS/DEPENDS_ON edges (populated by graph-projector.ts) to
// answer "what does changing this actually affect," instead of guessing
// from keywords in the raw request text.
// ---------------------------------------------------------------------------

const STRUCTURAL_EDGE_TYPES: ReadonlySet<ProductKnowledgeEdgeType> = new Set([
  "DEPENDS_ON",
  "TRIGGERS",
  "CONTAINS",
]);

export type ImpactedNode = {
  nodeId: string;
  type: ProductKnowledgeNodeType;
  label: string;
  relationshipPath: string[];
  // Section 19's confidence ladder. Only "implemented" and "stale" are
  // actually reachable in Stage 3: "confirmed" requires a VERIFIED_BY edge
  // (deferred to Stage 3+1, no such edge exists yet) and "inferred"
  // requires AI-backed edge production (not built). Kept as a 4-value
  // union, not narrowed to 2, so downstream consumers don't need a
  // breaking type change once Stage 3+1 ships.
  confidenceState: "confirmed" | "implemented" | "stale" | "inferred";
};

export type GraphImpactAnalysisResult = {
  directlyAffected: ImpactedNode[];
  transitivelyAffected: ImpactedNode[];
  /** Always empty in Stage 3 — no BUSINESS_METRIC/BUSINESS_EVENT nodes exist yet (deferred, Stage 3+1). */
  businessImpacts: ImpactedNode[];
  technicalImpacts: ImpactedNode[];
  /** Always empty in Stage 3 — requires TEST-node VERIFIED_BY edges, not populated by this slice. */
  requiredTests: string[];
  /** Always empty in Stage 3 — no established rule yet maps a graph node to a specific approval tier; change-flow.ts's own disclosureTier computation is unaffected by this field. */
  requiredApprovals: string[];
  uncertainImpacts: ImpactedNode[];
  missingGraphCoverage: boolean;
  recommendedExecutionOrder: string[];
  cyclicDependencyWarning: string | null;
  /** Always empty in Stage 3 — the Reversibility model (§24) is documented, not implemented as code. */
  rollbackConcerns: string[];
  /** Whether the resolved start node has any recorded structural edge at all — the signal `describeImpactCoverage` uses to distinguish "No impact exists" (real coverage, genuinely empty) from "No impact was found" (a possibly under-projected node). Meaningless when `missingGraphCoverage` is true. */
  hasAnyRecordedEdge: boolean;
};

/**
 * Section 20.4's required language distinction, computed from a result —
 * never conflated, per the acceptance review's own gate.
 */
export function describeImpactCoverage(result: GraphImpactAnalysisResult): string {
  if (result.missingGraphCoverage) {
    return "Impact cannot be determined because graph coverage is incomplete.";
  }
  if (result.directlyAffected.length > 0 || result.transitivelyAffected.length > 0) {
    const names = [...result.directlyAffected, ...result.transitivelyAffected]
      .map((n) => n.label)
      .join(", ");
    return `Changing this also affects: ${names}.`;
  }
  return result.hasAnyRecordedEdge ? "No impact exists." : "No impact was found.";
}

/**
 * Section 20.2: fuzzy label match. Word-boundary based, not raw character-
 * substring containment — live-testing against a real generation (Stage 3
 * implementation) found character-substring matching produces real false
 * positives a founder would find surprising: searching "Payment" (a real
 * DATA_MODEL) also matched the unrelated "Pay" ACTION node, since "pay" is
 * a character-substring prefix of "payment", even though they are
 * genuinely distinct concepts. Matching on whole words instead — a
 * candidate matches if its word set is a subset of the target's word set,
 * or vice versa — correctly still matches "Checkout" against "the Checkout
 * screen" (superset relationship) while no longer conflating "Pay" with
 * "Payment" (neither word set is a subset of the other). Consistent with
 * this initiative's "unknown over guessing" standard (Gate 5): a stricter
 * match that sometimes falls through to a disclosed "coverage incomplete"
 * result is preferred over a looser one that risks silently resolving to
 * the wrong node.
 */
export function fuzzyMatchNodes(
  nodes: readonly ProductKnowledgeNode[],
  targetLabel: string,
): ProductKnowledgeNode[] {
  const needleWords = wordsOf(targetLabel);
  if (needleWords.size === 0) return [];

  return nodes.filter((node) => {
    const candidateWords = wordsOf(node.label);
    if (candidateWords.size === 0) return false;
    const candidateIsSubset = [...candidateWords].every((w) => needleWords.has(w));
    const needleIsSubset = [...needleWords].every((w) => candidateWords.has(w));
    return candidateIsSubset || needleIsSubset;
  });
}

function wordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** Exact-equality normalization for `isStale`'s (type, label) comparison — deliberately not the word-set logic above, since staleness detection needs exact identity, not fuzzy resolution. */
function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export type TraversalResult = {
  directNodeIds: Set<string>;
  transitiveNodeIds: Set<string>;
  truncated: boolean;
};

/**
 * Section 20.2's full traversal spec: DEPENDS_ON reversed (what depends on
 * this), TRIGGERS and CONTAINS in both directions, depth-bounded (default
 * 3), fan-out-bounded (default 50), cycle-protected via a visited set.
 */
export function traverseFromNode(
  edges: readonly ProductKnowledgeEdge[],
  startNodeId: string,
  maxDepth = 3,
  fanoutLimit = 50,
): TraversalResult {
  const neighborsOf = (nodeId: string): string[] => {
    const result: string[] = [];
    for (const edge of edges) {
      if (edge.edgeType === "DEPENDS_ON" && edge.targetNodeId === nodeId) {
        result.push(edge.sourceNodeId);
      } else if (edge.edgeType === "TRIGGERS" || edge.edgeType === "CONTAINS") {
        if (edge.sourceNodeId === nodeId) result.push(edge.targetNodeId);
        if (edge.targetNodeId === nodeId) result.push(edge.sourceNodeId);
      }
    }
    return result;
  };

  const visited = new Set<string>([startNodeId]);
  const directNodeIds = new Set<string>();
  const transitiveNodeIds = new Set<string>();
  let frontier = [startNodeId];
  let truncated = false;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      for (const neighborId of neighborsOf(nodeId)) {
        if (visited.has(neighborId)) continue;
        if (visited.size >= fanoutLimit) {
          truncated = true;
          continue;
        }
        visited.add(neighborId);
        if (depth === 0) {
          directNodeIds.add(neighborId);
        } else {
          transitiveNodeIds.add(neighborId);
        }
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
  }

  return { directNodeIds, transitiveNodeIds, truncated };
}

export type TopologicalOrderResult = {
  order: string[];
  cycleWarning: string | null;
};

/**
 * Section 20.5: Kahn's algorithm over the DEPENDS_ON+TRIGGERS subgraph
 * restricted to `nodeIds`. `DEPENDS_ON` alone is validated acyclic at
 * edge-creation time (graph-projector.ts), but DEPENDS_ON+TRIGGERS
 * combined can still cycle — detected here, never silently ordered.
 */
export function topologicalOrder(
  nodeIds: readonly string[],
  edges: readonly ProductKnowledgeEdge[],
): TopologicalOrderResult {
  const nodeIdSet = new Set(nodeIds);
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.edgeType !== "DEPENDS_ON" && edge.edgeType !== "TRIGGERS") continue;
    if (!nodeIdSet.has(edge.sourceNodeId) || !nodeIdSet.has(edge.targetNodeId)) continue;

    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const frontier = nodeIds.filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (frontier.length > 0) {
    const nodeId = frontier.shift()!;
    order.push(nodeId);
    for (const targetId of outgoing.get(nodeId) ?? []) {
      const remaining = (inDegree.get(targetId) ?? 0) - 1;
      inDegree.set(targetId, remaining);
      if (remaining === 0) frontier.push(targetId);
    }
  }

  if (order.length < nodeIds.length) {
    const stuck = nodeIds.filter((id) => !order.includes(id));
    return { order: [], cycleWarning: `Cyclic dependency detected among: ${stuck.join(", ")}` };
  }

  return { order, cycleWarning: null };
}

/**
 * Section 19's Stale state: a node is stale if a newer node of the same
 * (type, normalized label) exists for this project — a query-time check,
 * not a stored flag, since regeneration creates a fresh, parallel node set
 * rather than mutating existing nodes (Section 3 P1's own Lifecycle).
 */
function isStale(node: ProductKnowledgeNode, allNodes: readonly ProductKnowledgeNode[]): boolean {
  const normalizedLabel = normalizeForMatch(node.label);
  return allNodes.some(
    (other) =>
      other.id !== node.id &&
      other.type === node.type &&
      normalizeForMatch(other.label) === normalizedLabel &&
      other.createdAt.getTime() > node.createdAt.getTime(),
  );
}

function toImpactedNode(
  nodeId: string,
  allNodes: readonly ProductKnowledgeNode[],
  pathLabel: string,
): ImpactedNode | null {
  const node = allNodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return {
    nodeId: node.id,
    type: node.type,
    label: node.label,
    relationshipPath: [pathLabel],
    confidenceState: isStale(node, allNodes) ? "stale" : "implemented",
  };
}

/**
 * The full orchestration: resolves a change target against the real
 * Product Knowledge Graph, traverses it, and returns a structured result —
 * never throwing for "nothing found," per Section 20.4's required
 * distinction between genuine absence and incomplete coverage.
 */
export async function analyzeGraphImpact(
  actorUserId: string,
  projectId: string,
  input: { changeTargetLabel: string },
): Promise<GraphImpactAnalysisResult> {
  const graph = await getKnowledgeGraph(actorUserId, projectId);
  const structuralEdges = graph.edges.filter((edge) => STRUCTURAL_EDGE_TYPES.has(edge.edgeType));

  // Change-target resolution is restricted to the node types the approved
  // edge triples (Section 9) can actually connect — SCREEN/WORKFLOW/
  // DATA_MODEL/ACTION. REQUIREMENT nodes are deliberately excluded: their
  // labels are full free-text requirement sentences (product-intelligence.ts),
  // not concise entity names, so fuzzy substring matching against them
  // trivially "matches" almost any common word in a real description,
  // producing false ambiguity — and no approved edge type ever connects a
  // REQUIREMENT node regardless, so matching one could never yield real
  // traversal results anyway. Confirmed necessary, not speculative: a real
  // generation whose description mentions "payment" produces a REQUIREMENT
  // node whose full sentence also contains "payment," which without this
  // filter made "Payment" (the real DATA_MODEL) unresolvably ambiguous.
  const RESOLVABLE_NODE_TYPES: ReadonlySet<ProductKnowledgeNodeType> = new Set([
    "SCREEN",
    "WORKFLOW",
    "DATA_MODEL",
    "ACTION",
  ]);
  const resolvableNodes = graph.nodes.filter((n) => RESOLVABLE_NODE_TYPES.has(n.type));

  const matches = fuzzyMatchNodes(resolvableNodes, input.changeTargetLabel);
  const uniqueMatchIds = new Set(matches.map((n) => n.id));

  const emptyResult: GraphImpactAnalysisResult = {
    directlyAffected: [],
    transitivelyAffected: [],
    businessImpacts: [],
    technicalImpacts: [],
    requiredTests: [],
    requiredApprovals: [],
    uncertainImpacts: [],
    missingGraphCoverage: true,
    recommendedExecutionOrder: [],
    cyclicDependencyWarning: null,
    rollbackConcerns: [],
    hasAnyRecordedEdge: false,
  };

  // Zero matches, or an ambiguous multi-match (more than one distinct node
  // resolves this label): coverage is incomplete, never a guess.
  if (uniqueMatchIds.size !== 1) {
    return emptyResult;
  }

  const startNode = matches[0]!;
  const hasAnyRecordedEdge = structuralEdges.some(
    (e) => e.sourceNodeId === startNode.id || e.targetNodeId === startNode.id,
  );

  const traversal = traverseFromNode(structuralEdges, startNode.id);
  const directlyAffected = [...traversal.directNodeIds]
    .map((id) => toImpactedNode(id, graph.nodes, `${startNode.label} -> ${id}`))
    .filter((n): n is ImpactedNode => n !== null);
  const transitivelyAffected = [...traversal.transitiveNodeIds]
    .map((id) => toImpactedNode(id, graph.nodes, `${startNode.label} -> ... -> ${id}`))
    .filter((n): n is ImpactedNode => n !== null);

  const affectedIds = [startNode.id, ...traversal.directNodeIds, ...traversal.transitiveNodeIds];
  const { order, cycleWarning } = topologicalOrder(affectedIds, structuralEdges);

  const uncertainImpacts: ImpactedNode[] = traversal.truncated
    ? [
        {
          nodeId: "__truncated__",
          type: startNode.type,
          label: "(additional nodes)",
          relationshipPath: [],
          confidenceState: "implemented",
        },
      ]
    : [];

  return {
    directlyAffected,
    transitivelyAffected,
    businessImpacts: [],
    technicalImpacts: [...directlyAffected, ...transitivelyAffected],
    requiredTests: [],
    requiredApprovals: [],
    uncertainImpacts,
    missingGraphCoverage: false,
    recommendedExecutionOrder: order,
    cyclicDependencyWarning: cycleWarning,
    rollbackConcerns: [],
    hasAnyRecordedEdge,
  };
}
