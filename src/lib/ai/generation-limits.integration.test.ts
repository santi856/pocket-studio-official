// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import type {
  beginGeneration as BeginGenerationType,
  ConcurrentGenerationLimitError as ConcurrentGenerationLimitErrorType,
  MonthlyGenerationQuotaExceededError as MonthlyGenerationQuotaExceededErrorType,
  MonthlySpendLimitExceededError as MonthlySpendLimitExceededErrorType,
} from "./generation-limits";

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
// — vi.resetModules() + a dynamic re-import per test is the same proven
// pattern as ai-usage.integration.test.ts.
async function loadModule(overrides: Record<string, string | undefined> = {}): Promise<{
  beginGeneration: typeof BeginGenerationType;
  ConcurrentGenerationLimitError: typeof ConcurrentGenerationLimitErrorType;
  MonthlyGenerationQuotaExceededError: typeof MonthlyGenerationQuotaExceededErrorType;
  MonthlySpendLimitExceededError: typeof MonthlySpendLimitExceededErrorType;
}> {
  vi.resetModules();
  setEnv({ ...BASE_ENV, ...overrides });
  return import("./generation-limits");
}

describe("AI generation limits", () => {
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
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    return { owner, org };
  }

  describe("monthly generation quota", () => {
    it("is unenforced (a no-op) when unconfigured, regardless of how many events already exist this month", async () => {
      const { org } = await seedOrg();
      await db.aiUsageEvent.createMany({
        data: Array.from({ length: 50 }, () => ({
          organizationId: org.id,
          provider: "anthropic",
          inputTokens: 10,
          outputTokens: 10,
        })),
      });
      const { beginGeneration } = await loadModule();

      const lease = await beginGeneration(org.id);
      await lease.release();
    });

    it("throws once the configured monthly limit is reached", async () => {
      const { org } = await seedOrg();
      await db.aiUsageEvent.createMany({
        data: Array.from({ length: 2 }, () => ({
          organizationId: org.id,
          provider: "anthropic",
          inputTokens: 10,
          outputTokens: 10,
        })),
      });
      const { beginGeneration, MonthlyGenerationQuotaExceededError } = await loadModule({
        AI_MONTHLY_GENERATION_LIMIT_PER_ORG: "2",
      });

      await expect(beginGeneration(org.id)).rejects.toBeInstanceOf(
        MonthlyGenerationQuotaExceededError,
      );
    });

    it("allows generation while under the configured monthly limit", async () => {
      const { org } = await seedOrg();
      await db.aiUsageEvent.create({
        data: { organizationId: org.id, provider: "anthropic", inputTokens: 10, outputTokens: 10 },
      });
      const { beginGeneration } = await loadModule({ AI_MONTHLY_GENERATION_LIMIT_PER_ORG: "2" });

      const lease = await beginGeneration(org.id);
      await lease.release();
    });

    it("does not count events from a previous month toward this month's quota", async () => {
      const { org } = await seedOrg();
      const lastMonth = new Date();
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      await db.aiUsageEvent.createMany({
        data: Array.from({ length: 5 }, () => ({
          organizationId: org.id,
          provider: "anthropic",
          inputTokens: 10,
          outputTokens: 10,
          createdAt: lastMonth,
        })),
      });
      const { beginGeneration } = await loadModule({ AI_MONTHLY_GENERATION_LIMIT_PER_ORG: "2" });

      const lease = await beginGeneration(org.id);
      await lease.release();
    });

    it("scopes the quota per organization — another org's usage never counts against this one", async () => {
      const { org } = await seedOrg();
      const otherOwner = await registerUser({
        email: "other@example.com",
        password: "password123",
      });
      const otherOrg = await createOrganization({ name: "Other Co", ownerUserId: otherOwner.id });
      await db.aiUsageEvent.createMany({
        data: Array.from({ length: 5 }, () => ({
          organizationId: otherOrg.id,
          provider: "anthropic",
          inputTokens: 10,
          outputTokens: 10,
        })),
      });
      const { beginGeneration } = await loadModule({ AI_MONTHLY_GENERATION_LIMIT_PER_ORG: "2" });

      const lease = await beginGeneration(org.id);
      await lease.release();
    });
  });

  describe("monthly spend limit", () => {
    it("is a disclosed no-op when no cost rate is configured, even if a spend limit and matching event count are set", async () => {
      const { org } = await seedOrg();
      await db.aiUsageEvent.create({
        data: {
          organizationId: org.id,
          provider: "anthropic",
          inputTokens: 100,
          outputTokens: 100,
          estimatedCostCents: null,
        },
      });
      const { beginGeneration } = await loadModule({ AI_MONTHLY_SPEND_LIMIT_CENTS: "0" });

      const lease = await beginGeneration(org.id);
      await lease.release();
    });

    it("throws once real accumulated cost meets the configured spend limit", async () => {
      const { org } = await seedOrg();
      await db.aiUsageEvent.createMany({
        data: [
          {
            organizationId: org.id,
            provider: "anthropic",
            inputTokens: 100,
            outputTokens: 100,
            estimatedCostCents: 60,
          },
          {
            organizationId: org.id,
            provider: "anthropic",
            inputTokens: 100,
            outputTokens: 100,
            estimatedCostCents: 50,
          },
        ],
      });
      const { beginGeneration, MonthlySpendLimitExceededError } = await loadModule({
        AI_MONTHLY_SPEND_LIMIT_CENTS: "100",
      });

      await expect(beginGeneration(org.id)).rejects.toBeInstanceOf(MonthlySpendLimitExceededError);
    });

    it("allows generation while real accumulated cost is under the configured spend limit", async () => {
      const { org } = await seedOrg();
      await db.aiUsageEvent.create({
        data: {
          organizationId: org.id,
          provider: "anthropic",
          inputTokens: 100,
          outputTokens: 100,
          estimatedCostCents: 10,
        },
      });
      const { beginGeneration } = await loadModule({ AI_MONTHLY_SPEND_LIMIT_CENTS: "100" });

      const lease = await beginGeneration(org.id);
      await lease.release();
    });
  });

  describe("concurrency lease", () => {
    it("allows up to the configured concurrent limit, then rejects the next", async () => {
      const { org } = await seedOrg();
      const { beginGeneration, ConcurrentGenerationLimitError } = await loadModule({
        AI_MAX_CONCURRENT_GENERATIONS_PER_ORG: "2",
      });

      const first = await beginGeneration(org.id);
      const second = await beginGeneration(org.id);

      await expect(beginGeneration(org.id)).rejects.toBeInstanceOf(ConcurrentGenerationLimitError);

      await first.release();
      await second.release();
    });

    it("allows a new generation once a held lease is released", async () => {
      const { org } = await seedOrg();
      const { beginGeneration } = await loadModule({
        AI_MAX_CONCURRENT_GENERATIONS_PER_ORG: "1",
      });

      const first = await beginGeneration(org.id);
      await first.release();

      const second = await beginGeneration(org.id);
      await second.release();
    });

    it("scopes concurrency per organization — another org's in-flight leases never count against this one", async () => {
      const { org } = await seedOrg();
      const otherOwner = await registerUser({
        email: "other@example.com",
        password: "password123",
      });
      const otherOrg = await createOrganization({ name: "Other Co", ownerUserId: otherOwner.id });
      const { beginGeneration } = await loadModule({
        AI_MAX_CONCURRENT_GENERATIONS_PER_ORG: "1",
      });

      const otherLease = await beginGeneration(otherOrg.id);
      const lease = await beginGeneration(org.id);

      await otherLease.release();
      await lease.release();
    });

    it("treats a lease far older than the staleness window as abandoned (a crashed process), not counted toward the limit", async () => {
      const { org } = await seedOrg();
      await db.aiGenerationLease.create({
        data: { organizationId: org.id, createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      const { beginGeneration } = await loadModule({
        AI_MAX_CONCURRENT_GENERATIONS_PER_ORG: "1",
      });

      // The stale lease is swept before counting, so this succeeds instead
      // of incorrectly reporting the limit as already reached.
      const lease = await beginGeneration(org.id);
      await lease.release();
      expect(await db.aiGenerationLease.count({ where: { organizationId: org.id } })).toBe(0);
    });

    it("release() actually removes the lease row, and is safe to call twice", async () => {
      const { org } = await seedOrg();
      const { beginGeneration } = await loadModule();

      const lease = await beginGeneration(org.id);
      expect(await db.aiGenerationLease.count({ where: { organizationId: org.id } })).toBe(1);

      await lease.release();
      expect(await db.aiGenerationLease.count({ where: { organizationId: org.id } })).toBe(0);

      await expect(lease.release()).resolves.toBeUndefined();
    });
  });
});
