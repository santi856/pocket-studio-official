import "server-only";
import type {
  Prisma,
  ProductKnowledgeEdgeType,
  ProductKnowledgeNodeType,
} from "@/generated/prisma/client";
import { createKnowledgeEdge } from "@/lib/product/product-knowledge";
import { recordEvidence } from "@/lib/product/evidence";
import { BLUEPRINT_CATEGORY_TEMPLATES } from "./blueprint-templates";
import { deriveDataDependencies, type BlueprintDataModel } from "./build-planner";
import type { ImpactCategory } from "@/lib/orchestration/impact-analysis";

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

export type BlueprintNodeMaps = {
  screenNodeIdByLabel: ReadonlyMap<string, string>;
  workflowNodeIdByLabel: ReadonlyMap<string, string>;
  dataModelNodeIdByLabel: ReadonlyMap<string, string>;
  actionNodeIdByLabel: ReadonlyMap<string, string>;
};

function mapForType(
  type: ProductKnowledgeNodeType,
  maps: BlueprintNodeMaps,
): ReadonlyMap<string, string> {
  switch (type) {
    case "SCREEN":
      return maps.screenNodeIdByLabel;
    case "WORKFLOW":
      return maps.workflowNodeIdByLabel;
    case "DATA_MODEL":
      return maps.dataModelNodeIdByLabel;
    case "ACTION":
      return maps.actionNodeIdByLabel;
    default:
      return new Map();
  }
}

type EdgeCandidate = {
  edgeType: ProductKnowledgeEdgeType;
  sourceType: ProductKnowledgeNodeType;
  targetType: ProductKnowledgeNodeType;
  sourceLabel: string;
  targetLabel: string;
  provenance: Prisma.InputJsonValue;
};

/**
 * Derives every candidate edge this generation *could* produce, purely
 * from already-computed inputs — no database access, so this half of the
 * projector is independently testable without a real generation call.
 *
 * DEPENDS_ON reuses `deriveDataDependencies` (build-planner.ts) unchanged.
 * CONTAINS/TRIGGERS come from `BLUEPRINT_CATEGORY_TEMPLATES`'s optional
 * `onScreen`/`triggersWorkflow` pairing — restricted to the categories this
 * *specific* generation actually matched (`categories`), so a reference to
 * a category that wasn't matched simply produces no candidate, not a
 * guessed one (Section 10 step 3's own "produces nothing rather than
 * guesses" standard).
 */
export function deriveCandidateEdges(input: {
  categories: readonly ImpactCategory[];
  screens: readonly string[];
  dataModels: readonly BlueprintDataModel[];
}): EdgeCandidate[] {
  const candidates: EdgeCandidate[] = [];

  const dataDependencies = deriveDataDependencies([...input.screens], [...input.dataModels]);
  for (const [screen, modelNames] of Object.entries(dataDependencies)) {
    for (const modelName of modelNames) {
      candidates.push({
        edgeType: "DEPENDS_ON",
        sourceType: "SCREEN",
        targetType: "DATA_MODEL",
        sourceLabel: screen,
        targetLabel: modelName,
        provenance: { sourceField: "deriveDataDependencies", screen, dataModel: modelName },
      });
    }
  }

  for (const category of input.categories) {
    const template = BLUEPRINT_CATEGORY_TEMPLATES[category];
    for (const action of template?.actions ?? []) {
      if (typeof action === "string") continue;

      if (action.onScreen !== undefined) {
        candidates.push({
          edgeType: "CONTAINS",
          sourceType: "SCREEN",
          targetType: "ACTION",
          sourceLabel: action.onScreen,
          targetLabel: action.name,
          provenance: { sourceField: "actions[].onScreen", categoryTemplate: category },
        });
      }
      if (action.triggersWorkflow !== undefined) {
        candidates.push({
          edgeType: "TRIGGERS",
          sourceType: "ACTION",
          targetType: "WORKFLOW",
          sourceLabel: action.name,
          targetLabel: action.triggersWorkflow,
          provenance: { sourceField: "actions[].triggersWorkflow", categoryTemplate: category },
        });
      }
    }
  }

  return candidates;
}

export type ProjectionResult = {
  candidateCount: number;
  createdCount: number;
  /** Human-readable reasons, one per candidate that was not persisted — never silently dropped. */
  missing: string[];
};

/**
 * Section 10's full edge-creation workflow, live. Called from
 * `blueprint-generator.ts` immediately after node creation, in the same
 * generation call. Per Section 3 P1's Failure behavior: a candidate that
 * cannot be resolved or created is recorded in `missing`, never thrown —
 * edge-creation failure must never block generation. The caller (this
 * function itself) does not write the summarizing `ProductEvidence` row;
 * see `recordGraphProjectionEvidence` below, called separately so a test
 * can exercise projection without also asserting on evidence-recording
 * side effects.
 */
export async function projectBlueprintRelationships(
  actorUserId: string,
  projectId: string,
  input: {
    categories: readonly ImpactCategory[];
    screens: readonly string[];
    dataModels: readonly BlueprintDataModel[];
    nodeMaps: BlueprintNodeMaps;
  },
): Promise<ProjectionResult> {
  const candidates = deriveCandidateEdges(input);
  const createdDependsOnEdges: CandidateEdge[] = [];
  const missing: string[] = [];
  let createdCount = 0;

  for (const candidate of candidates) {
    const sourceId = mapForType(candidate.sourceType, input.nodeMaps).get(candidate.sourceLabel);
    const targetId = mapForType(candidate.targetType, input.nodeMaps).get(candidate.targetLabel);

    const describe = () =>
      `${candidate.edgeType}: "${candidate.sourceLabel}" -> "${candidate.targetLabel}"`;

    if (!sourceId || !targetId) {
      missing.push(
        `${describe()} (one or both nodes were not created for this generation — the referenced ` +
          `category may not have been matched)`,
      );
      continue;
    }

    if (!isApprovedEdgeTriple(candidate.sourceType, candidate.targetType, candidate.edgeType)) {
      // Not reachable given deriveCandidateEdges's own fixed triple shapes
      // above — a fail-safe check, not a live code path today.
      missing.push(`${describe()} (not an approved edge triple)`);
      continue;
    }

    if (
      candidate.edgeType === "DEPENDS_ON" &&
      wouldCreateDependsOnCycle(createdDependsOnEdges, { sourceId, targetId })
    ) {
      missing.push(`${describe()} (would create a DEPENDS_ON cycle, skipped)`);
      continue;
    }

    try {
      await createKnowledgeEdge(actorUserId, projectId, {
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        edgeType: candidate.edgeType,
        provenance: candidate.provenance,
      });
      createdCount++;
      if (candidate.edgeType === "DEPENDS_ON") {
        createdDependsOnEdges.push({ sourceId, targetId });
      }
    } catch (error) {
      missing.push(
        `${describe()} (${error instanceof Error ? error.message : "edge creation failed"})`,
      );
    }
  }

  return { candidateCount: candidates.length, createdCount, missing };
}

/**
 * Section 10 items 9-10: one ProductEvidence row per generation recording
 * how many candidate relationships were actually projected, and why any
 * were not — this is what lets the new Quality Gate check (Migration Plan
 * Phase 3) report a real, itemized finding instead of a silent gap or an
 * opaque pass/fail boolean.
 */
export async function recordGraphProjectionEvidence(
  actorUserId: string,
  projectId: string,
  result: ProjectionResult,
): Promise<void> {
  await recordEvidence(actorUserId, projectId, {
    evidenceType: "GRAPH_PROJECTION",
    subjectKey: "graph.relationships",
    verificationMethod: "graph-projector.ts's projectBlueprintRelationships()",
    result: `${result.createdCount} of ${result.candidateCount} candidate relationships projected.`,
    limitations: result.missing.length > 0 ? result.missing.join("; ") : undefined,
  });
}
