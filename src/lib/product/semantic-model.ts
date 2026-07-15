import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { ProductSemanticModel, Prisma } from "@/generated/prisma/client";

export type ProductSemanticModelInput = {
  schemaVersion: string;
  purpose?: string | null;
  targetUsers?: Prisma.InputJsonValue;
  actors?: Prisma.InputJsonValue;
  entities?: Prisma.InputJsonValue;
  workflows?: Prisma.InputJsonValue;
  capabilities?: Prisma.InputJsonValue;
  permissions?: Prisma.InputJsonValue;
  businessRules?: Prisma.InputJsonValue;
  monetization?: Prisma.InputJsonValue;
  integrations?: Prisma.InputJsonValue;
  constraints?: Prisma.InputJsonValue;
  unresolvedQuestions?: Prisma.InputJsonValue;
  consequentialDecisions?: Prisma.InputJsonValue;
  unsupportedRequirements?: Prisma.InputJsonValue;
  generationMetadata: Prisma.InputJsonValue;
  coverageResult?: Prisma.InputJsonValue;
  basedOnProductStateVersion: number;
};

/**
 * Full-replace versioned, exactly like Blueprint/ProductState (see
 * src/lib/generation/blueprint.ts) — each version is generated fresh from
 * the current raw idea text, never a partial patch. Sits between Product
 * State and Blueprint (D-0065, execution/architecture/
 * SEMANTIC_PRODUCT_COMPILER_REPORT.md §11).
 */
export async function createSemanticModelVersion(
  actorUserId: string,
  projectId: string,
  input: ProductSemanticModelInput,
): Promise<ProductSemanticModel> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return createNextVersion(() =>
    db.$transaction(async (tx) => {
      const latest = await tx.productSemanticModel.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      });

      return tx.productSemanticModel.create({
        data: {
          projectId,
          version: (latest?.version ?? 0) + 1,
          createdByUserId: actorUserId,
          schemaVersion: input.schemaVersion,
          purpose: input.purpose,
          targetUsers: input.targetUsers,
          actors: input.actors,
          entities: input.entities,
          workflows: input.workflows,
          capabilities: input.capabilities,
          permissions: input.permissions,
          businessRules: input.businessRules,
          monetization: input.monetization,
          integrations: input.integrations,
          constraints: input.constraints,
          unresolvedQuestions: input.unresolvedQuestions,
          consequentialDecisions: input.consequentialDecisions,
          unsupportedRequirements: input.unsupportedRequirements,
          generationMetadata: input.generationMetadata,
          coverageResult: input.coverageResult,
          basedOnProductStateVersion: input.basedOnProductStateVersion,
        },
      });
    }),
  );
}

export async function getLatestSemanticModel(
  actorUserId: string,
  projectId: string,
): Promise<ProductSemanticModel | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productSemanticModel.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}

export async function listSemanticModelVersions(
  actorUserId: string,
  projectId: string,
): Promise<ProductSemanticModel[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productSemanticModel.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}
