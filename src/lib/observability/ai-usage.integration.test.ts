// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import type {
  getAiUsageLimits as GetAiUsageLimitsType,
  getAiUsageSummary as GetAiUsageSummaryType,
  getAiUsageSummaryForCurrentMonth as GetAiUsageSummaryForCurrentMonthType,
  recordAiUsageEvent as RecordAiUsageEventType,
} from "./ai-usage";

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

const BASE_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
};

// getServerEnv() (src/lib/env.ts) caches its parse result at module scope
// — vi.resetModules() + a dynamic re-import per test is the same pattern
// already proven reliable elsewhere in this codebase (e.g.
// stripe-billing-provider.test.ts, smtp-provider.test.ts). ForbiddenError
// is re-imported fresh alongside it in the same reset cycle: after
// vi.resetModules(), the statically-imported class at the top of this
// file would be a *different* class object than the one ai-usage.ts
// actually throws, so instanceof would always fail.
async function loadModule(overrides: Record<string, string | undefined> = {}): Promise<{
  recordAiUsageEvent: typeof RecordAiUsageEventType;
  getAiUsageSummary: typeof GetAiUsageSummaryType;
  getAiUsageSummaryForCurrentMonth: typeof GetAiUsageSummaryForCurrentMonthType;
  getAiUsageLimits: typeof GetAiUsageLimitsType;
  ForbiddenError: typeof import("@/lib/tenancy/authz").ForbiddenError;
}> {
  vi.resetModules();
  setEnv({ ...BASE_ENV, ...overrides });
  const [aiUsage, authz] = await Promise.all([import("./ai-usage"), import("@/lib/tenancy/authz")]);
  return { ...aiUsage, ForbiddenError: authz.ForbiddenError };
}

describe("AI usage tracking", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedOrg() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    return { owner, outsider, org };
  }

  it("records real token counts with a null cost when no rate is configured", async () => {
    const { org } = await seedOrg();
    const { recordAiUsageEvent } = await loadModule();

    const event = await recordAiUsageEvent({
      organizationId: org.id,
      provider: "anthropic",
      inputTokens: 120,
      outputTokens: 45,
    });

    expect(event.inputTokens).toBe(120);
    expect(event.outputTokens).toBe(45);
    expect(event.estimatedCostCents).toBeNull();
  });

  it("computes a real cost once an operator configures a rate", async () => {
    const { org } = await seedOrg();
    const { recordAiUsageEvent } = await loadModule({
      AI_COST_PER_1K_INPUT_TOKENS_CENTS: "3",
      AI_COST_PER_1K_OUTPUT_TOKENS_CENTS: "15",
    });

    const event = await recordAiUsageEvent({
      organizationId: org.id,
      provider: "anthropic",
      inputTokens: 1000,
      outputTokens: 1000,
    });

    expect(event.estimatedCostCents).toBe(18);
  });

  it("never computes a cost for a non-anthropic provider, even with a rate configured", async () => {
    const { org } = await seedOrg();
    const { recordAiUsageEvent } = await loadModule({
      AI_COST_PER_1K_INPUT_TOKENS_CENTS: "3",
      AI_COST_PER_1K_OUTPUT_TOKENS_CENTS: "15",
    });

    const event = await recordAiUsageEvent({
      organizationId: org.id,
      provider: "mock",
      inputTokens: 1000,
      outputTokens: 1000,
    });

    expect(event.estimatedCostCents).toBeNull();
  });

  it("summarizes real usage for an organization, requiring ADMIN access", async () => {
    const { owner, outsider, org } = await seedOrg();
    const { recordAiUsageEvent, getAiUsageSummary, ForbiddenError } = await loadModule();

    await recordAiUsageEvent({
      organizationId: org.id,
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 50,
    });
    await recordAiUsageEvent({
      organizationId: org.id,
      provider: "anthropic",
      inputTokens: 200,
      outputTokens: 75,
    });

    const summary = await getAiUsageSummary(owner.id, org.id);
    expect(summary.eventCount).toBe(2);
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(125);
    expect(summary.totalEstimatedCostCents).toBeNull();

    await expect(getAiUsageSummary(outsider.id, org.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies a plain MEMBER (not ADMIN or OWNER) from viewing the usage summary", async () => {
    const { org } = await seedOrg();
    const { getAiUsageSummary, ForbiddenError } = await loadModule();
    const member = await registerUser({ email: "member@example.com", password: "password123" });
    await db.membership.create({
      data: { userId: member.id, organizationId: org.id, role: "MEMBER" },
    });

    await expect(getAiUsageSummary(member.id, org.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  describe("getAiUsageSummaryForCurrentMonth", () => {
    it("only counts events from the current calendar month, not earlier ones", async () => {
      const { owner, org } = await seedOrg();
      const { recordAiUsageEvent, getAiUsageSummaryForCurrentMonth } = await loadModule();
      const lastMonth = new Date();
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      await db.aiUsageEvent.create({
        data: {
          organizationId: org.id,
          provider: "anthropic",
          inputTokens: 999,
          outputTokens: 999,
          createdAt: lastMonth,
        },
      });
      await recordAiUsageEvent({
        organizationId: org.id,
        provider: "anthropic",
        inputTokens: 10,
        outputTokens: 5,
      });

      const summary = await getAiUsageSummaryForCurrentMonth(owner.id, org.id);
      expect(summary.eventCount).toBe(1);
      expect(summary.totalInputTokens).toBe(10);
    });
  });

  describe("getAiUsageLimits", () => {
    it("reports null (unconfigured/unlimited) when no limits are set, never an invented number", async () => {
      const { getAiUsageLimits } = await loadModule();

      expect(getAiUsageLimits()).toEqual({
        monthlyGenerationLimit: null,
        monthlySpendLimitCents: null,
      });
    });

    it("reports the real configured limits", async () => {
      const { getAiUsageLimits } = await loadModule({
        AI_MONTHLY_GENERATION_LIMIT_PER_ORG: "500",
        AI_MONTHLY_SPEND_LIMIT_CENTS: "10000",
      });

      expect(getAiUsageLimits()).toEqual({
        monthlyGenerationLimit: 500,
        monthlySpendLimitCents: 10000,
      });
    });
  });
});
