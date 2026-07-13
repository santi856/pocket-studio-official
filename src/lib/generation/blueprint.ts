import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { Blueprint, BlueprintValidationStatus, Prisma } from "@/generated/prisma/client";

export type BlueprintInput = {
  schemaVersion: string;
  productType?: string | null;
  targetUsers?: Prisma.InputJsonValue;
  roles?: Prisma.InputJsonValue;
  requirements?: Prisma.InputJsonValue;
  workflows?: Prisma.InputJsonValue;
  screens?: Prisma.InputJsonValue;
  navigation?: Prisma.InputJsonValue;
  dataModels?: Prisma.InputJsonValue;
  permissions?: Prisma.InputJsonValue;
  actions?: Prisma.InputJsonValue;
  integrations?: Prisma.InputJsonValue;
  businessRules?: Prisma.InputJsonValue;
  monetization?: Prisma.InputJsonValue;
  subscriptions?: Prisma.InputJsonValue;
  ownerOperations?: Prisma.InputJsonValue;
  outputTargets?: Prisma.InputJsonValue;
  themeAndStyle?: Prisma.InputJsonValue;
  interactionContracts?: Prisma.InputJsonValue;
  assumptions?: Prisma.InputJsonValue;
  openDecisions?: Prisma.InputJsonValue;
  memory?: Prisma.InputJsonValue;
  security?: Prisma.InputJsonValue;
  privacy?: Prisma.InputJsonValue;
  accessibility?: Prisma.InputJsonValue;
  governance?: Prisma.InputJsonValue;
  feasibility?: Prisma.InputJsonValue;
  generationMetadata?: Prisma.InputJsonValue;
  validationStatus: BlueprintValidationStatus;
  validationErrors?: Prisma.InputJsonValue;
  basedOnProductStateVersion?: number | null;
  basedOnProductDnaVersion?: number | null;
};

/**
 * Full-replace versioned, like ProductState (not carry-forward like
 * ProductDNA) — each Blueprint version is generated fresh, either by P2-01's
 * deterministic generator or from a validated Change Set (P2-08), never a
 * partial patch onto the previous version. Prior versions remain
 * inspectable evidence, per Master Spec §27's version-history requirements.
 */
export async function createBlueprintVersion(
  actorUserId: string,
  projectId: string,
  input: BlueprintInput,
): Promise<Blueprint> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return createNextVersion(() =>
    db.$transaction(async (tx) => {
      const latest = await tx.blueprint.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      });

      return tx.blueprint.create({
        data: {
          projectId,
          version: (latest?.version ?? 0) + 1,
          createdByUserId: actorUserId,
          schemaVersion: input.schemaVersion,
          productType: input.productType,
          targetUsers: input.targetUsers,
          roles: input.roles,
          requirements: input.requirements,
          workflows: input.workflows,
          screens: input.screens,
          navigation: input.navigation,
          dataModels: input.dataModels,
          permissions: input.permissions,
          actions: input.actions,
          integrations: input.integrations,
          businessRules: input.businessRules,
          monetization: input.monetization,
          subscriptions: input.subscriptions,
          ownerOperations: input.ownerOperations,
          outputTargets: input.outputTargets,
          themeAndStyle: input.themeAndStyle,
          interactionContracts: input.interactionContracts,
          assumptions: input.assumptions,
          openDecisions: input.openDecisions,
          memory: input.memory,
          security: input.security,
          privacy: input.privacy,
          accessibility: input.accessibility,
          governance: input.governance,
          feasibility: input.feasibility,
          generationMetadata: input.generationMetadata,
          validationStatus: input.validationStatus,
          validationErrors: input.validationErrors,
          basedOnProductStateVersion: input.basedOnProductStateVersion,
          basedOnProductDnaVersion: input.basedOnProductDnaVersion,
        },
      });
    }),
  );
}

export async function getLatestBlueprint(
  actorUserId: string,
  projectId: string,
): Promise<Blueprint | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.blueprint.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}

export async function listBlueprintVersions(
  actorUserId: string,
  projectId: string,
): Promise<Blueprint[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.blueprint.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}

export async function getBlueprintVersion(
  actorUserId: string,
  projectId: string,
  version: number,
): Promise<Blueprint | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.blueprint.findUnique({ where: { projectId_version: { projectId, version } } });
}
