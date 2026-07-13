import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { PolicyDocument, PolicyDocumentType } from "@/generated/prisma/client";

export type CreatePolicyDocumentDraftInput = {
  type: PolicyDocumentType;
  content: string;
  language?: string;
  basedOnProductStateVersion?: number;
};

/**
 * Versioned per (projectId, type, language) — Master Spec §34/§35. Always
 * creates a DRAFT; publication requires customer approval and, where
 * appropriate, professional review (§34), neither of which this function
 * performs — it only persists the draft.
 */
export async function createPolicyDocumentDraft(
  actorUserId: string,
  projectId: string,
  input: CreatePolicyDocumentDraftInput,
): Promise<PolicyDocument> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const language = input.language ?? "en";

  return createNextVersion(() =>
    db.$transaction(async (tx) => {
      const previous = await tx.policyDocument.findFirst({
        where: { projectId, type: input.type, language },
        orderBy: { version: "desc" },
      });

      return tx.policyDocument.create({
        data: {
          projectId,
          type: input.type,
          language,
          version: (previous?.version ?? 0) + 1,
          status: "DRAFT",
          content: input.content,
          basedOnProductStateVersion: input.basedOnProductStateVersion,
          createdByUserId: actorUserId,
        },
      });
    }),
  );
}

export async function getLatestPolicyDocument(
  actorUserId: string,
  projectId: string,
  type: PolicyDocumentType,
  language = "en",
): Promise<PolicyDocument | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.policyDocument.findFirst({
    where: { projectId, type, language },
    orderBy: { version: "desc" },
  });
}

export async function listPolicyDocuments(
  actorUserId: string,
  projectId: string,
): Promise<PolicyDocument[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.policyDocument.findMany({
    where: { projectId },
    orderBy: [{ type: "asc" }, { language: "asc" }, { version: "desc" }],
  });
}
