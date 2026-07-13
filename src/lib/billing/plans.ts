import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
import type { PlanDefinition, PlanKey, Prisma } from "@/generated/prisma/client";

export type PlanDefinitionInput = {
  planKey: PlanKey;
  name: string;
  monthlyPriceCents?: number;
  annualPriceCents?: number;
  currency?: string;
  entitlements: Prisma.InputJsonValue;
};

/**
 * Platform-wide (like CapabilityRegistryEntry), append-only versioned per
 * planKey — no tenant to check, this is Pocket Studio's own pricing
 * policy (Master Spec §36).
 */
export async function upsertPlanVersion(
  definition: PlanDefinitionInput,
  actorUserId?: string,
): Promise<PlanDefinition> {
  return createNextVersion(() =>
    db.$transaction(async (tx) => {
      const previous = await tx.planDefinition.findFirst({
        where: { planKey: definition.planKey },
        orderBy: { version: "desc" },
      });

      return tx.planDefinition.create({
        data: {
          planKey: definition.planKey,
          version: (previous?.version ?? 0) + 1,
          name: definition.name,
          monthlyPriceCents: definition.monthlyPriceCents,
          annualPriceCents: definition.annualPriceCents,
          currency: definition.currency ?? "usd",
          entitlements: definition.entitlements,
          createdByUserId: actorUserId,
        },
      });
    }),
  );
}

export async function getLatestPlan(planKey: PlanKey): Promise<PlanDefinition | null> {
  return db.planDefinition.findFirst({
    where: { planKey },
    orderBy: { version: "desc" },
  });
}

export async function listLatestPlans(): Promise<PlanDefinition[]> {
  const all = await db.planDefinition.findMany({
    orderBy: [{ planKey: "asc" }, { version: "desc" }],
  });

  const latestByKey = new Map<PlanKey, PlanDefinition>();
  for (const entry of all) {
    if (!latestByKey.has(entry.planKey)) {
      latestByKey.set(entry.planKey, entry);
    }
  }

  return Array.from(latestByKey.values());
}
