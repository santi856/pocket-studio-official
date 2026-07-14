import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getProductAnalyticsSnapshot } from "@/lib/analytics/product-analytics";
import type { ProductOutcomeRecord } from "@/generated/prisma/client";

export class ProductKnowledgeNodeNotFoundError extends Error {
  constructor() {
    super("No such Product Knowledge Graph node exists for this project.");
    this.name = "ProductKnowledgeNodeNotFoundError";
  }
}

export type RecordProductOutcomeInput = {
  knowledgeNodeId?: string;
  metricKey: string;
  value: number;
  source: string;
};

/**
 * Master Spec §61 "Product Outcome foundation" — a real, recorded outcome
 * fact, optionally tied to a node in the existing Product Knowledge Graph
 * (§12, src/lib/product/product-knowledge.ts). Never estimated or
 * inferred; `source` names where the number actually came from (e.g.
 * "product-analytics-snapshot" for recordProductAnalyticsSnapshotAsOutcomes
 * below, or a caller-specified source for a manually recorded fact).
 */
export async function recordProductOutcome(
  actorUserId: string,
  projectId: string,
  input: RecordProductOutcomeInput,
): Promise<ProductOutcomeRecord> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  if (input.knowledgeNodeId) {
    const node = await db.productKnowledgeNode.findFirst({
      where: { id: input.knowledgeNodeId, projectId },
    });
    if (!node) {
      throw new ProductKnowledgeNodeNotFoundError();
    }
  }

  return db.productOutcomeRecord.create({
    data: {
      projectId,
      knowledgeNodeId: input.knowledgeNodeId,
      metricKey: input.metricKey,
      value: input.value,
      source: input.source,
    },
  });
}

export async function listProductOutcomes(
  actorUserId: string,
  projectId: string,
  filter?: { metricKey?: string },
): Promise<ProductOutcomeRecord[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productOutcomeRecord.findMany({
    where: { projectId, metricKey: filter?.metricKey },
    orderBy: { recordedAt: "desc" },
  });
}

const SNAPSHOT_SOURCE = "product-analytics-snapshot";

/**
 * Gives P3-12's real-time-only product analytics a real historical
 * record: every call durably records the current snapshot's numeric
 * facts as ProductOutcomeRecord rows, so listProductOutcomes can later
 * show a genuine time series — closing P3-12's own disclosed "not a
 * historical trend view" limitation without changing what
 * getProductAnalyticsSnapshot itself does.
 */
export async function recordProductAnalyticsSnapshotAsOutcomes(
  actorUserId: string,
  projectId: string,
): Promise<ProductOutcomeRecord[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const snapshot = await getProductAnalyticsSnapshot(actorUserId, projectId);

  const facts: Array<{ metricKey: string; value: number }> = [
    { metricKey: "generatedAppUserCount", value: snapshot.generatedAppUserCount },
    { metricKey: "payments.succeeded", value: snapshot.payments.succeeded },
    { metricKey: "payments.failed", value: snapshot.payments.failed },
    {
      metricKey: "payments.totalSucceededAmountCents",
      value: snapshot.payments.totalSucceededAmountCents,
    },
  ];
  if (snapshot.truthStatusImplementedFraction !== null) {
    facts.push({
      metricKey: "truthStatusImplementedFraction",
      value: snapshot.truthStatusImplementedFraction,
    });
  }

  return Promise.all(
    facts.map((fact) =>
      db.productOutcomeRecord.create({
        data: { projectId, metricKey: fact.metricKey, value: fact.value, source: SNAPSHOT_SOURCE },
      }),
    ),
  );
}
