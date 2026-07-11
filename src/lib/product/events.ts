import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { Prisma, ProductEvent, ProductEventType } from "@/generated/prisma/client";

/**
 * Append-only audit trail of state-changing actions on a project (Master
 * Spec §50). Never updated or deleted.
 */
export async function recordEvent(
  actorUserId: string,
  projectId: string,
  input: { type: ProductEventType; summary: string; data?: Prisma.InputJsonValue },
): Promise<ProductEvent> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productEvent.create({
    data: {
      projectId,
      type: input.type,
      summary: input.summary,
      data: input.data,
      actorUserId,
    },
  });
}

export async function listEvents(
  actorUserId: string,
  projectId: string,
  filter?: { type?: ProductEventType },
): Promise<ProductEvent[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productEvent.findMany({
    where: { projectId, type: filter?.type },
    orderBy: { createdAt: "desc" },
  });
}
