import "server-only";
import { upsertPlanVersion } from "@/lib/billing/plans";
import type { PlanDefinitionInput } from "@/lib/billing/plans";

/**
 * Master Spec §36 names five plans (Free/Explore, Builder, Launch, Managed,
 * Agency) "with configurable pricing and entitlements." Only Free/Explore
 * has a real, known price (0) — every paid plan's price is left `undefined`
 * (unconfigured) rather than invented, per §36: "final prices remain
 * configurable and must not be invented when not supplied."
 */
export const INITIAL_PLANS: readonly PlanDefinitionInput[] = [
  {
    planKey: "FREE_EXPLORE",
    name: "Free / Explore",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: {
      projectLimit: 1,
      storageMb: 100,
      exportAllowed: false,
      deploymentAllowed: false,
      teamSeats: 1,
    },
  },
  {
    planKey: "BUILDER",
    name: "Builder",
    entitlements: {
      projectLimit: 5,
      storageMb: 2000,
      exportAllowed: true,
      deploymentAllowed: false,
      teamSeats: 1,
    },
  },
  {
    planKey: "LAUNCH",
    name: "Launch",
    entitlements: {
      projectLimit: 20,
      storageMb: 10000,
      exportAllowed: true,
      deploymentAllowed: true,
      teamSeats: 3,
    },
  },
  {
    planKey: "MANAGED",
    name: "Managed",
    entitlements: {
      projectLimit: 50,
      storageMb: 50000,
      exportAllowed: true,
      deploymentAllowed: true,
      teamSeats: 10,
    },
  },
  {
    planKey: "AGENCY",
    name: "Agency",
    entitlements: {
      projectLimit: null,
      storageMb: null,
      exportAllowed: true,
      deploymentAllowed: true,
      teamSeats: null,
    },
  },
] as const;

export async function seedPlans(actorUserId?: string): Promise<void> {
  for (const definition of INITIAL_PLANS) {
    await upsertPlanVersion(definition, actorUserId);
  }
}
