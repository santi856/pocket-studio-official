import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { TruthStatusEntry, TruthStatusValue } from "@/generated/prisma/client";

export type SetTruthStatusInput = {
  subjectKey: string;
  subjectLabel: string;
  status: TruthStatusValue;
  evidenceRef?: string;
  rationale?: string;
};

/**
 * Append-only versioned per (projectId, subjectKey) — same "latest wins,
 * history preserved" pattern as ProductState/ProductDNA/CapabilityRegistry.
 * A capability never silently becomes "implemented"; every status change
 * is a new, evidenced row (Master Spec §53's "truthful statuses").
 */
export async function setTruthStatus(
  actorUserId: string,
  projectId: string,
  input: SetTruthStatusInput,
): Promise<TruthStatusEntry> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.$transaction(async (tx) => {
    const previous = await tx.truthStatusEntry.findFirst({
      where: { projectId, subjectKey: input.subjectKey },
      orderBy: { version: "desc" },
    });

    return tx.truthStatusEntry.create({
      data: {
        projectId,
        subjectKey: input.subjectKey,
        subjectLabel: input.subjectLabel,
        version: (previous?.version ?? 0) + 1,
        status: input.status,
        evidenceRef: input.evidenceRef,
        rationale: input.rationale,
        createdByUserId: actorUserId,
      },
    });
  });
}

export async function getLatestTruthStatus(
  actorUserId: string,
  projectId: string,
  subjectKey: string,
): Promise<TruthStatusEntry | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.truthStatusEntry.findFirst({
    where: { projectId, subjectKey },
    orderBy: { version: "desc" },
  });
}

/**
 * Returns the latest status for every distinct subjectKey in the project —
 * this is what a Trust/Truth Status screen (Simple Mode §6, Expert Mode
 * §7) renders. Reduced in application code, same tradeoff as
 * listLatestCapabilities: correctness over a fancier SQL query, acceptable
 * at Phase 1 scale (one project's subjects, not millions of rows).
 */
export async function listLatestTruthStatuses(
  actorUserId: string,
  projectId: string,
): Promise<TruthStatusEntry[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const all = await db.truthStatusEntry.findMany({
    where: { projectId },
    orderBy: [{ subjectKey: "asc" }, { version: "desc" }],
  });

  const latestByKey = new Map<string, TruthStatusEntry>();
  for (const entry of all) {
    if (!latestByKey.has(entry.subjectKey)) {
      latestByKey.set(entry.subjectKey, entry);
    }
  }

  return Array.from(latestByKey.values());
}
