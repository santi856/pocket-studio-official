import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { GovernanceProfile, Prisma } from "@/generated/prisma/client";

export type UpsertGovernanceProfileInput = {
  businessLocations?: Prisma.InputJsonValue;
  userLocations?: Prisma.InputJsonValue;
  productCategory?: string;
  userAgeRange?: string;
  dataCategories?: Prisma.InputJsonValue;
  monetizationModel?: string;
  distributionChannels?: Prisma.InputJsonValue;
  relevantGovernanceDomains?: Prisma.InputJsonValue;
};

/**
 * One mutable profile per project (Master Spec §32). Not append-only
 * versioned like Product State/DNA — this is project configuration, not
 * an intelligence artifact with a meaningful history of its own; changes
 * are still visible via the Event Ledger once a caller records them.
 */
export async function upsertGovernanceProfile(
  actorUserId: string,
  projectId: string,
  input: UpsertGovernanceProfileInput,
): Promise<GovernanceProfile> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.governanceProfile.upsert({
    where: { projectId },
    create: { projectId, ...input },
    update: input,
  });
}

export async function getGovernanceProfile(
  actorUserId: string,
  projectId: string,
): Promise<GovernanceProfile | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.governanceProfile.findUnique({ where: { projectId } });
}
