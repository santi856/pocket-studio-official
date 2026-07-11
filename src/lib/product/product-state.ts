import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { Prisma, ProductState } from "@/generated/prisma/client";

export type ProductStateInput = {
  originalIdea: string;
  productIntelligence?: Prisma.InputJsonValue;
  feasibilityReport?: Prisma.InputJsonValue;
  businessModelBrief?: Prisma.InputJsonValue;
  monetizationRecommendations?: Prisma.InputJsonValue;
  unitEconomicsAssumptions?: Prisma.InputJsonValue;
  operationalComplexity?: Prisma.InputJsonValue;
  requiredIntegrations?: Prisma.InputJsonValue;
  outputTargets?: Prisma.InputJsonValue;
  governanceRequirements?: Prisma.InputJsonValue;
};

/**
 * Canonical Product State is append-only (Master Spec §9 lists "versions"
 * as part of what the state connects to). Each call creates a new version
 * rather than mutating the previous one, so earlier states remain
 * inspectable evidence instead of being overwritten.
 */
export async function createProductStateVersion(
  actorUserId: string,
  projectId: string,
  input: ProductStateInput,
): Promise<ProductState> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.$transaction(async (tx) => {
    const latest = await tx.productState.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
    });

    return tx.productState.create({
      data: {
        projectId,
        version: (latest?.version ?? 0) + 1,
        createdByUserId: actorUserId,
        originalIdea: input.originalIdea,
        productIntelligence: input.productIntelligence,
        feasibilityReport: input.feasibilityReport,
        businessModelBrief: input.businessModelBrief,
        monetizationRecommendations: input.monetizationRecommendations,
        unitEconomicsAssumptions: input.unitEconomicsAssumptions,
        operationalComplexity: input.operationalComplexity,
        requiredIntegrations: input.requiredIntegrations,
        outputTargets: input.outputTargets,
        governanceRequirements: input.governanceRequirements,
      },
    });
  });
}

export async function getLatestProductState(
  actorUserId: string,
  projectId: string,
): Promise<ProductState | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productState.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}

export async function listProductStateVersions(
  actorUserId: string,
  projectId: string,
): Promise<ProductState[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productState.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}
