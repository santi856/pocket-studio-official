// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { getLatestPlan, listLatestPlans, upsertPlanVersion } from "./plans";
import { INITIAL_PLANS, seedPlans } from "./seed-plans";

describe("Plan Registry versioning", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("creates version 1 on first write", async () => {
    const plan = await upsertPlanVersion({
      planKey: "BUILDER",
      name: "Builder",
      entitlements: { projectLimit: 5 },
    });
    expect(plan.version).toBe(1);
  });

  it("increments the version and getLatestPlan returns the newest", async () => {
    await upsertPlanVersion({ planKey: "BUILDER", name: "Builder v1", entitlements: {} });
    await upsertPlanVersion({ planKey: "BUILDER", name: "Builder v2", entitlements: {} });

    const latest = await getLatestPlan("BUILDER");
    expect(latest?.version).toBe(2);
    expect(latest?.name).toBe("Builder v2");
  });

  it("never invents a price when none was supplied", async () => {
    const plan = await upsertPlanVersion({ planKey: "LAUNCH", name: "Launch", entitlements: {} });
    expect(plan.monthlyPriceCents).toBeNull();
    expect(plan.annualPriceCents).toBeNull();
  });
});

describe("seedPlans", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("has no duplicate plan keys in the seed data itself", () => {
    const keys = INITIAL_PLANS.map((p) => p.planKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("inserts one version-1 row per plan", async () => {
    await seedPlans();
    const plans = await listLatestPlans();
    expect(plans).toHaveLength(INITIAL_PLANS.length);
    expect(plans.every((p) => p.version === 1)).toBe(true);
  });

  it("only Free/Explore has a known, non-null price", async () => {
    await seedPlans();
    const plans = await listLatestPlans();

    const free = plans.find((p) => p.planKey === "FREE_EXPLORE");
    expect(free?.monthlyPriceCents).toBe(0);

    const paidPlans = plans.filter((p) => p.planKey !== "FREE_EXPLORE");
    expect(paidPlans.every((p) => p.monthlyPriceCents === null)).toBe(true);
  });
});
