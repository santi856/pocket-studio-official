import "server-only";
import type { ProductKnowledgeEdgeType, ProductKnowledgeNodeType } from "@/generated/prisma/client";

/**
 * Stage 3 (D-0081, STAGE_2_ARCHITECTURE_PROPOSAL.md §9/§10). The governed,
 * minimal set of (source node type, target node type, edge type) triples
 * approved for this slice — VERIFIED_BY is deferred to Stage 3+1 (its only
 * valid targets, TEST/EVIDENCE nodes, are not populated here; see §10.1).
 * A closed vocabulary, the same discipline this codebase already applies to
 * ImpactCategory/ProductKnowledgeNodeType/TruthStatusValue — no edge triple
 * outside this table may be created without amending the architecture
 * proposal first.
 */
const APPROVED_EDGE_TRIPLES: ReadonlySet<string> = new Set([
  tripleKey("SCREEN", "ACTION", "CONTAINS"),
  tripleKey("WORKFLOW", "ACTION", "CONTAINS"),
  tripleKey("ACTION", "WORKFLOW", "TRIGGERS"),
  tripleKey("WORKFLOW", "DATA_MODEL", "DEPENDS_ON"),
  tripleKey("SCREEN", "DATA_MODEL", "DEPENDS_ON"),
]);

function tripleKey(
  sourceType: ProductKnowledgeNodeType,
  targetType: ProductKnowledgeNodeType,
  edgeType: ProductKnowledgeEdgeType,
): string {
  return `${sourceType}->${targetType}:${edgeType}`;
}

/**
 * Section 10 step 4b: reject any (sourceType, targetType, edgeType) triple
 * not in the approved table before the insert is attempted — deliberately
 * enforced here, in the Graph Projector, not inside `createKnowledgeEdge`
 * itself, which stays domain-agnostic (product-knowledge.ts's own updated
 * docstring).
 */
export function isApprovedEdgeTriple(
  sourceType: ProductKnowledgeNodeType,
  targetType: ProductKnowledgeNodeType,
  edgeType: ProductKnowledgeEdgeType,
): boolean {
  return APPROVED_EDGE_TRIPLES.has(tripleKey(sourceType, targetType, edgeType));
}

export type CandidateEdge = { sourceId: string; targetId: string };

/**
 * Section 10 step 4c / Section 9's cycle invariant: DEPENDS_ON must be
 * acyclic by construction (a workflow cannot depend on itself
 * transitively). Bounded reverse traversal from the candidate edge's own
 * target back toward its source, over the *existing* DEPENDS_ON edge set
 * only — max depth 20, chosen to comfortably exceed any real Blueprint's
 * workflow/screen count while bounding worst-case cost (Section 10's own
 * stated reasoning). Returns true if inserting `candidate` would close a
 * cycle, i.e. `candidate.targetId` can already reach `candidate.sourceId`
 * via existing edges.
 */
export function wouldCreateDependsOnCycle(
  existingDependsOnEdges: readonly CandidateEdge[],
  candidate: CandidateEdge,
  maxDepth = 20,
): boolean {
  if (candidate.sourceId === candidate.targetId) return true;

  const outgoingFrom = new Map<string, string[]>();
  for (const edge of existingDependsOnEdges) {
    const targets = outgoingFrom.get(edge.sourceId) ?? [];
    targets.push(edge.targetId);
    outgoingFrom.set(edge.sourceId, targets);
  }

  const visited = new Set<string>([candidate.targetId]);
  let frontier = [candidate.targetId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      for (const nextId of outgoingFrom.get(nodeId) ?? []) {
        if (nextId === candidate.sourceId) return true;
        if (!visited.has(nextId)) {
          visited.add(nextId);
          nextFrontier.push(nextId);
        }
      }
    }
    frontier = nextFrontier;
  }

  return false;
}
