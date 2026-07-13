import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { Prisma } from "@/generated/prisma/client";
import type { ProductDNA } from "@/generated/prisma/client";

type JsonCreateValue = Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;

/**
 * Prisma's generated create input for a nullable Json column does not
 * accept a literal `null` (it would be ambiguous with "field not set") —
 * it requires the `Prisma.JsonNull` sentinel instead. This translates our
 * public `null`-means-clear convention into that sentinel at the boundary.
 */
function toJsonCreateValue(value: Prisma.InputJsonValue | null | undefined): JsonCreateValue {
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value;
}

// Every field is `T | null` (clear it) in addition to being an optional
// key (omit it to carry the previous version's value forward) — `undefined`
// as an explicit value is deliberately not a distinct third state here,
// since JS/JSON cannot round-trip "key present but undefined" reliably.
export type ProductDNAInput = {
  originalIdea?: string;
  purpose?: string | null;
  problem?: string | null;
  targetUsers?: Prisma.InputJsonValue | null;
  productThesis?: string | null;
  differentiation?: string | null;
  productEdge?: string | null;
  customerPromise?: string | null;
  brandDirection?: Prisma.InputJsonValue | null;
  businessModel?: string | null;
  monetizationDirection?: string | null;
  constraints?: Prisma.InputJsonValue | null;
  nonNegotiables?: Prisma.InputJsonValue | null;
  acceptedDecisions?: Prisma.InputJsonValue | null;
  rejectedDecisions?: Prisma.InputJsonValue | null;
  openQuestions?: Prisma.InputJsonValue | null;
  knownRisks?: Prisma.InputJsonValue | null;
};

/**
 * "Edits must not silently erase Product DNA" (Master Spec §10). A field
 * omitted from `input` carries forward the previous version's value rather
 * than being cleared — callers can only remove a field by explicitly
 * setting it to `null`, which is a deliberate act, not an accidental one.
 */
export async function updateProductDNA(
  actorUserId: string,
  projectId: string,
  input: ProductDNAInput,
): Promise<ProductDNA> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return createNextVersion(() =>
    db.$transaction(async (tx) => {
      const previous = await tx.productDNA.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
      });

      const originalIdea = "originalIdea" in input ? input.originalIdea : previous?.originalIdea;
      if (!originalIdea) {
        throw new Error("Product DNA requires originalIdea on its first version.");
      }

      return tx.productDNA.create({
        data: {
          projectId,
          version: (previous?.version ?? 0) + 1,
          createdByUserId: actorUserId,
          originalIdea,
          purpose: "purpose" in input ? input.purpose : previous?.purpose,
          problem: "problem" in input ? input.problem : previous?.problem,
          targetUsers: toJsonCreateValue(
            "targetUsers" in input ? input.targetUsers : previous?.targetUsers,
          ),
          productThesis: "productThesis" in input ? input.productThesis : previous?.productThesis,
          differentiation:
            "differentiation" in input ? input.differentiation : previous?.differentiation,
          productEdge: "productEdge" in input ? input.productEdge : previous?.productEdge,
          customerPromise:
            "customerPromise" in input ? input.customerPromise : previous?.customerPromise,
          brandDirection: toJsonCreateValue(
            "brandDirection" in input ? input.brandDirection : previous?.brandDirection,
          ),
          businessModel: "businessModel" in input ? input.businessModel : previous?.businessModel,
          monetizationDirection:
            "monetizationDirection" in input
              ? input.monetizationDirection
              : previous?.monetizationDirection,
          constraints: toJsonCreateValue(
            "constraints" in input ? input.constraints : previous?.constraints,
          ),
          nonNegotiables: toJsonCreateValue(
            "nonNegotiables" in input ? input.nonNegotiables : previous?.nonNegotiables,
          ),
          acceptedDecisions: toJsonCreateValue(
            "acceptedDecisions" in input ? input.acceptedDecisions : previous?.acceptedDecisions,
          ),
          rejectedDecisions: toJsonCreateValue(
            "rejectedDecisions" in input ? input.rejectedDecisions : previous?.rejectedDecisions,
          ),
          openQuestions: toJsonCreateValue(
            "openQuestions" in input ? input.openQuestions : previous?.openQuestions,
          ),
          knownRisks: toJsonCreateValue(
            "knownRisks" in input ? input.knownRisks : previous?.knownRisks,
          ),
        },
      });
    }),
  );
}

export async function getLatestProductDNA(
  actorUserId: string,
  projectId: string,
): Promise<ProductDNA | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productDNA.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}

export async function listProductDNAVersions(
  actorUserId: string,
  projectId: string,
): Promise<ProductDNA[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.productDNA.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}
