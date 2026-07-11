import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type {
  IntegrationConnectionStatus,
  IntegrationOwner,
  IntegrationRequirement,
  IntegrationRequirementLevel,
  Prisma,
} from "@/generated/prisma/client";

export type UpsertIntegrationRequirementInput = {
  category: string;
  purpose: string;
  requirementLevel: IntegrationRequirementLevel;
  owner: IntegrationOwner;
  connectionStatus: IntegrationConnectionStatus;
  providerOptions?: Prisma.InputJsonValue;
  selectedProvider?: string;
  setupRequirements?: string;
  costNotes?: string;
  securityNotes?: string;
  privacyNotes?: string;
  launchImpact?: string;
  fallbackBehavior?: string;
};

/**
 * One row per (project, category) — Master Spec §30. Upsert rather than
 * append-only versioned: this tracks *current* connection state, which is
 * expected to change as a customer connects/disconnects providers, not a
 * historical intelligence artifact.
 */
export async function upsertIntegrationRequirement(
  actorUserId: string,
  projectId: string,
  input: UpsertIntegrationRequirementInput,
): Promise<IntegrationRequirement> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.integrationRequirement.upsert({
    where: { projectId_category: { projectId, category: input.category } },
    create: { projectId, ...input },
    update: input,
  });
}

export async function listIntegrationRequirements(
  actorUserId: string,
  projectId: string,
): Promise<IntegrationRequirement[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.integrationRequirement.findMany({
    where: { projectId },
    orderBy: { category: "asc" },
  });
}
