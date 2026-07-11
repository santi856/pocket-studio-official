import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { Prisma, ProductMemoryEntry, ProductMemoryEntryType } from "@/generated/prisma/client";

export async function addProductMemoryEntry(
  actorUserId: string,
  projectId: string,
  input: {
    type: ProductMemoryEntryType;
    content: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<ProductMemoryEntry> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productMemoryEntry.create({
    data: {
      projectId,
      type: input.type,
      content: input.content,
      metadata: input.metadata,
      createdByUserId: actorUserId,
    },
  });
}

export async function listProductMemoryEntries(
  actorUserId: string,
  projectId: string,
  filter?: { type?: ProductMemoryEntryType },
): Promise<ProductMemoryEntry[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productMemoryEntry.findMany({
    where: { projectId, type: filter?.type },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Master Spec §11: memory must be "deletable according to policy." This
 * deletes a single entry the caller has tenant access to — it is not a
 * bulk-wipe operation, deliberately, so accidental data loss requires
 * deleting entries one at a time or via an explicit bulk policy built
 * later once retention rules exist.
 */
export async function deleteProductMemoryEntry(
  actorUserId: string,
  projectId: string,
  entryId: string,
): Promise<void> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  await db.productMemoryEntry.deleteMany({
    where: { id: entryId, projectId },
  });
}
