import "server-only";
import { getLatestCapability } from "@/lib/registry/capability-registry";
import type { CapabilityImplementationLevel, CapabilityRiskClass } from "@/generated/prisma/client";

export type FeasibilityAssessment = {
  capabilityKey: string;
  label: string;
  category: string;
  implementationLevel: CapabilityImplementationLevel;
  riskClass: CapabilityRiskClass;
  limitations: string[];
};

export type FeasibilityReport = {
  assessments: FeasibilityAssessment[];
  /** Capability keys with no registry entry — reported, never assumed supported. */
  unrecognizedCapabilityKeys: string[];
  /** True only if every requested capability is currently available in some form. */
  overallSupported: boolean;
};

const CURRENTLY_AVAILABLE_LEVELS: ReadonlySet<CapabilityImplementationLevel> = new Set([
  "SUPPORTED_NOW",
  "SUPPORTED_WITH_CONFIGURATION",
  "SUPPORTED_WITH_CUSTOMER_INTEGRATION",
]);

function toLimitationsArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * "Determine Feasibility" (Master Spec §13, §16). Looks up each requested
 * capability against the Supported Capability Registry — the registry, not
 * this function's judgment, is what determines what Pocket Studio may
 * promise. An unrecognized capability is reported as such, never silently
 * treated as supported (Master Spec §4.3's "insufficient information"
 * category exists precisely for this case).
 */
export async function assessFeasibility(capabilityKeys: string[]): Promise<FeasibilityReport> {
  const assessments: FeasibilityAssessment[] = [];
  const unrecognizedCapabilityKeys: string[] = [];

  for (const capabilityKey of capabilityKeys) {
    const entry = await getLatestCapability(capabilityKey);

    if (!entry) {
      unrecognizedCapabilityKeys.push(capabilityKey);
      continue;
    }

    assessments.push({
      capabilityKey: entry.capabilityKey,
      label: entry.label,
      category: entry.category,
      implementationLevel: entry.implementationLevel,
      riskClass: entry.riskClass,
      limitations: toLimitationsArray(entry.limitations),
    });
  }

  const overallSupported =
    assessments.length > 0 &&
    unrecognizedCapabilityKeys.length === 0 &&
    assessments.every((assessment) =>
      CURRENTLY_AVAILABLE_LEVELS.has(assessment.implementationLevel),
    );

  return { assessments, unrecognizedCapabilityKeys, overallSupported };
}
