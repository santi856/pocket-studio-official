import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { BuildPlan, BuildPlanStatus, Prisma } from "@/generated/prisma/client";

export type BuildPlanInput = {
  basedOnBlueprintVersion: number;
  planStatus: BuildPlanStatus;
  implementationPhases: Prisma.InputJsonValue;
  dependencies: Prisma.InputJsonValue;
  screenOrder: Prisma.InputJsonValue;
  componentStructure: Prisma.InputJsonValue;
  navigationGraph: Prisma.InputJsonValue;
  dataDependencies: Prisma.InputJsonValue;
  backendAndBusinessLogic: Prisma.InputJsonValue;
  administrativeRequirements: Prisma.InputJsonValue;
  integrations: Prisma.InputJsonValue;
  monetization: Prisma.InputJsonValue;
  platformRequirements: Prisma.InputJsonValue;
  persistence: Prisma.InputJsonValue;
  tests: Prisma.InputJsonValue;
  acceptanceCriteria: Prisma.InputJsonValue;
  evidenceRequirements: Prisma.InputJsonValue;
  risk: Prisma.InputJsonValue;
  blockers: Prisma.InputJsonValue;
  generationMetadata?: Prisma.InputJsonValue;
};

/**
 * Full-replace versioned, like Blueprint — each Build Plan version is
 * generated fresh from the Blueprint version it is based on, never a
 * partial patch. Prior versions remain inspectable evidence.
 */
export async function createBuildPlanVersion(
  actorUserId: string,
  projectId: string,
  input: BuildPlanInput,
): Promise<BuildPlan> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return createNextVersion(() =>
    db.$transaction(async (tx) => {
      const latest = await tx.buildPlan.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      });

      return tx.buildPlan.create({
        data: {
          projectId,
          version: (latest?.version ?? 0) + 1,
          createdByUserId: actorUserId,
          basedOnBlueprintVersion: input.basedOnBlueprintVersion,
          planStatus: input.planStatus,
          implementationPhases: input.implementationPhases,
          dependencies: input.dependencies,
          screenOrder: input.screenOrder,
          componentStructure: input.componentStructure,
          navigationGraph: input.navigationGraph,
          dataDependencies: input.dataDependencies,
          backendAndBusinessLogic: input.backendAndBusinessLogic,
          administrativeRequirements: input.administrativeRequirements,
          integrations: input.integrations,
          monetization: input.monetization,
          platformRequirements: input.platformRequirements,
          persistence: input.persistence,
          tests: input.tests,
          acceptanceCriteria: input.acceptanceCriteria,
          evidenceRequirements: input.evidenceRequirements,
          risk: input.risk,
          blockers: input.blockers,
          generationMetadata: input.generationMetadata,
        },
      });
    }),
  );
}

export async function getLatestBuildPlan(
  actorUserId: string,
  projectId: string,
): Promise<BuildPlan | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.buildPlan.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}

export async function listBuildPlanVersions(
  actorUserId: string,
  projectId: string,
): Promise<BuildPlan[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.buildPlan.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}
