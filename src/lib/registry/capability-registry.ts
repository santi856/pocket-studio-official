import "server-only";
import { db } from "@/lib/db";
import type {
  CapabilityImplementationLevel,
  CapabilityRegistryEntry,
  CapabilityRiskClass,
  Prisma,
} from "@/generated/prisma/client";

export type CapabilityDefinition = {
  capabilityKey: string;
  label: string;
  category: string;
  outputTargets?: Prisma.InputJsonValue;
  implementationLevel: CapabilityImplementationLevel;
  requiredIntegrations?: Prisma.InputJsonValue;
  evidenceStandard?: string;
  riskClass: CapabilityRiskClass;
  limitations?: Prisma.InputJsonValue;
  providerDependencies?: Prisma.InputJsonValue;
  launchImplications?: string;
};

/**
 * Registry writes are an internal/seed operation, not a customer action —
 * there is no tenant to check access against. Always creates a new version
 * rather than mutating in place, per Master Spec §16 "versioned Supported
 * Capability Registry."
 */
export async function upsertCapabilityVersion(
  definition: CapabilityDefinition,
  actorUserId?: string,
): Promise<CapabilityRegistryEntry> {
  return db.$transaction(async (tx) => {
    const previous = await tx.capabilityRegistryEntry.findFirst({
      where: { capabilityKey: definition.capabilityKey },
      orderBy: { version: "desc" },
    });

    return tx.capabilityRegistryEntry.create({
      data: {
        capabilityKey: definition.capabilityKey,
        version: (previous?.version ?? 0) + 1,
        label: definition.label,
        category: definition.category,
        outputTargets: definition.outputTargets,
        implementationLevel: definition.implementationLevel,
        requiredIntegrations: definition.requiredIntegrations,
        evidenceStandard: definition.evidenceStandard,
        riskClass: definition.riskClass,
        limitations: definition.limitations,
        providerDependencies: definition.providerDependencies,
        launchImplications: definition.launchImplications,
        createdByUserId: actorUserId,
      },
    });
  });
}

export async function getLatestCapability(
  capabilityKey: string,
): Promise<CapabilityRegistryEntry | null> {
  return db.capabilityRegistryEntry.findFirst({
    where: { capabilityKey },
    orderBy: { version: "desc" },
  });
}

/**
 * Returns the latest version of every distinct capability. Reduces in
 * application code rather than a SQL DISTINCT ON — the registry is small
 * (dozens, not millions, of rows) and this keeps the query portable.
 */
export async function listLatestCapabilities(filter?: {
  category?: string;
}): Promise<CapabilityRegistryEntry[]> {
  const all = await db.capabilityRegistryEntry.findMany({
    where: filter?.category ? { category: filter.category } : undefined,
    orderBy: [{ capabilityKey: "asc" }, { version: "desc" }],
  });

  const latestByKey = new Map<string, CapabilityRegistryEntry>();
  for (const entry of all) {
    if (!latestByKey.has(entry.capabilityKey)) {
      latestByKey.set(entry.capabilityKey, entry);
    }
  }

  return Array.from(latestByKey.values());
}
