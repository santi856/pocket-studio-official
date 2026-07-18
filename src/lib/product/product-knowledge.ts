import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type {
  Prisma,
  ProductKnowledgeEdge,
  ProductKnowledgeEdgeType,
  ProductKnowledgeNode,
  ProductKnowledgeNodeType,
} from "@/generated/prisma/client";

export class InvalidKnowledgeEdgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKnowledgeEdgeError";
  }
}

export async function createKnowledgeNode(
  actorUserId: string,
  projectId: string,
  input: { type: ProductKnowledgeNodeType; label: string; data?: Prisma.InputJsonValue },
): Promise<ProductKnowledgeNode> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productKnowledgeNode.create({
    data: {
      projectId,
      type: input.type,
      label: input.label,
      data: input.data,
    },
  });
}

/**
 * Both endpoints must belong to the *same* project the caller has access
 * to — this is what stops one tenant's knowledge graph from ever being
 * wired into another's, even by an id-guessing attempt (Master Spec §12
 * stable identifiers only help impact analysis if the graph itself cannot
 * cross tenant boundaries).
 *
 * Deliberately stays domain-agnostic: this function does not know or
 * enforce which (source node type, target node type, edgeType) triples
 * are semantically valid for Blueprint-derived relationships — that policy
 * belongs to whichever caller understands the domain (the Graph Projector,
 * src/lib/generation/graph-projector.ts, Stage 3 D-0081), consistent with
 * this schema's own design comment ("a generic typed graph... the edge
 * shape is a Phase 2 orchestration concern, not a Phase 1 schema concern").
 * `edgeType` is required (no valid "untyped" edge, per
 * STAGE_2_ARCHITECTURE_PROPOSAL.md §10.1); `provenance` is optional since a
 * caller that has nothing meaningful to record about origin may omit it.
 */
export async function createKnowledgeEdge(
  actorUserId: string,
  projectId: string,
  input: {
    sourceNodeId: string;
    targetNodeId: string;
    edgeType: ProductKnowledgeEdgeType;
    provenance?: Prisma.InputJsonValue;
  },
): Promise<ProductKnowledgeEdge> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [sourceNode, targetNode] = await Promise.all([
    db.productKnowledgeNode.findUnique({ where: { id: input.sourceNodeId } }),
    db.productKnowledgeNode.findUnique({ where: { id: input.targetNodeId } }),
  ]);

  if (!sourceNode || sourceNode.projectId !== projectId) {
    throw new InvalidKnowledgeEdgeError("Source node does not belong to this project.");
  }
  if (!targetNode || targetNode.projectId !== projectId) {
    throw new InvalidKnowledgeEdgeError("Target node does not belong to this project.");
  }
  if (sourceNode.id === targetNode.id) {
    throw new InvalidKnowledgeEdgeError("A node cannot be linked to itself.");
  }

  return db.productKnowledgeEdge.create({
    data: {
      projectId,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      edgeType: input.edgeType,
      provenance: input.provenance,
    },
  });
}

export async function listKnowledgeNodes(
  actorUserId: string,
  projectId: string,
  filter?: { type?: ProductKnowledgeNodeType },
): Promise<ProductKnowledgeNode[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productKnowledgeNode.findMany({
    where: { projectId, type: filter?.type },
    orderBy: { createdAt: "asc" },
  });
}

export async function getKnowledgeGraph(
  actorUserId: string,
  projectId: string,
): Promise<{ nodes: ProductKnowledgeNode[]; edges: ProductKnowledgeEdge[] }> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [nodes, edges] = await Promise.all([
    db.productKnowledgeNode.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.productKnowledgeEdge.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
  ]);

  return { nodes, edges };
}
