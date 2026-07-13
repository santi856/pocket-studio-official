import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
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

  return createNextVersion(() =>
    db.$transaction(async (tx) => {
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
    }),
  );
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

export class NoProductStateError extends Error {
  constructor() {
    super("This project has no Product State yet — describe an idea first.");
    this.name = "NoProductStateError";
  }
}

/**
 * Master Spec §20: unit-economics assumptions must be "editable." Carries
 * every other field of the latest version forward unchanged and creates a
 * new version with only unitEconomicsAssumptions replaced — the same
 * append-only pattern as every other write to Product State, so a prior
 * assumption set remains inspectable evidence rather than being lost.
 */
export async function updateUnitEconomicsAssumptions(
  actorUserId: string,
  projectId: string,
  unitEconomicsAssumptions: Prisma.InputJsonValue,
): Promise<ProductState> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const latest = await getLatestProductState(actorUserId, projectId);
  if (!latest) {
    throw new NoProductStateError();
  }

  return createProductStateVersion(actorUserId, projectId, {
    originalIdea: latest.originalIdea,
    productIntelligence: latest.productIntelligence ?? undefined,
    feasibilityReport: latest.feasibilityReport ?? undefined,
    businessModelBrief: latest.businessModelBrief ?? undefined,
    monetizationRecommendations: latest.monetizationRecommendations ?? undefined,
    unitEconomicsAssumptions,
    operationalComplexity: latest.operationalComplexity ?? undefined,
    requiredIntegrations: latest.requiredIntegrations ?? undefined,
    outputTargets: latest.outputTargets ?? undefined,
    governanceRequirements: latest.governanceRequirements ?? undefined,
  });
}
