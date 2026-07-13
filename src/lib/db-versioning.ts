import "server-only";
import { Prisma } from "@/generated/prisma/client";

const MAX_VERSION_CONFLICT_RETRIES = 20;

function jitteredBackoffMs(attempt: number): number {
  return Math.floor(Math.random() * 25 * attempt);
}

/**
 * Every append-only versioned model (Blueprint, BuildPlan, ProductState,
 * ProductDNA, PolicyDocument, TruthStatusEntry, Capability, PlanDefinition)
 * creates its next row the same way: read the current latest `version`
 * inside a transaction, then create `version + 1`. Postgres's default READ
 * COMMITTED isolation does not serialize that read-then-write pair, so two
 * concurrent callers (a double-clicked "Generate app" button, a slow
 * connection retrying a submit) can both read the same latest version and
 * race to insert the same next version, tripping the `(projectId, version)`
 * unique constraint (Prisma error P2002) — surfacing as an uncaught crash
 * instead of the graceful failure this codebase requires everywhere else
 * (Phase 2 Level 3 review round 1, finding 1). Retrying the whole
 * transaction is safe: the retry re-reads whatever is now the real latest
 * version, so the second attempt computes the correct next version instead
 * of colliding again.
 */
export async function createNextVersion<T>(createFn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_VERSION_CONFLICT_RETRIES; attempt++) {
    try {
      return await createFn();
    } catch (error) {
      const isVersionConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isVersionConflict || attempt === MAX_VERSION_CONFLICT_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, jitteredBackoffMs(attempt)));
    }
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error("createNextVersion: exhausted retries without returning or throwing.");
}
