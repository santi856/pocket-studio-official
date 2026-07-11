import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { ProductEvidence, ProductEvidenceType } from "@/generated/prisma/client";

export type RecordEvidenceInput = {
  evidenceType: ProductEvidenceType;
  subjectKey: string;
  verificationMethod: string;
  result: string;
  limitations?: string;
};

/**
 * Product-facing Evidence Ledger (Master Spec §50). Every record is
 * append-only and immutable — a superseded claim gets a new evidence
 * record, never an edit, so the trail of what was actually verified (and
 * when) is never lost.
 */
export async function recordEvidence(
  actorUserId: string,
  projectId: string,
  input: RecordEvidenceInput,
): Promise<ProductEvidence> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productEvidence.create({
    data: {
      projectId,
      evidenceType: input.evidenceType,
      subjectKey: input.subjectKey,
      verificationMethod: input.verificationMethod,
      result: input.result,
      limitations: input.limitations,
      createdByUserId: actorUserId,
    },
  });
}

export async function listEvidence(
  actorUserId: string,
  projectId: string,
  filter?: { subjectKey?: string },
): Promise<ProductEvidence[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productEvidence.findMany({
    where: { projectId, subjectKey: filter?.subjectKey },
    orderBy: { createdAt: "desc" },
  });
}
