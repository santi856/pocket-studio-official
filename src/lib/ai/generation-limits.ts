import "server-only";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { startOfCurrentMonth } from "@/lib/observability/ai-usage";

// A crashed process's lease is only ever detected opportunistically, on
// the next acquisition attempt for the same organization — this window
// must comfortably exceed the AI provider's own request timeout
// (REQUEST_TIMEOUT_MS, anthropic-provider.ts, currently 30s) so a real,
// still-in-flight request is never mistaken for an abandoned one.
const LEASE_STALE_MS = 5 * 60 * 1000;

export class ConcurrentGenerationLimitError extends Error {
  constructor() {
    super(
      "This workspace has too many AI generations in progress at once. Please try again in a moment.",
    );
    this.name = "ConcurrentGenerationLimitError";
  }
}

export class MonthlyGenerationQuotaExceededError extends Error {
  constructor() {
    super("This workspace has reached its AI generation limit for this month.");
    this.name = "MonthlyGenerationQuotaExceededError";
  }
}

export class MonthlySpendLimitExceededError extends Error {
  constructor() {
    super("This workspace has reached its AI spending limit for this month.");
    this.name = "MonthlySpendLimitExceededError";
  }
}

/**
 * AI_MONTHLY_GENERATION_LIMIT_PER_ORG / AI_MONTHLY_SPEND_LIMIT_CENTS
 * (src/lib/env.ts) — both unset by default (no invented quota or dollar
 * figure), so this is a no-op until an operator configures a real value.
 * Reads the same AiUsageEvent rows getAiUsageSummary already does
 * (src/lib/observability/ai-usage.ts), just windowed to the current
 * calendar month via the existing `[organizationId, createdAt]` index —
 * no new table or migration needed for quota accounting itself.
 *
 * Runs as a plain read against already-committed rows, not inside the
 * same transaction as the concurrency lease below — an intentional,
 * disclosed imprecision: at most one extra generation could slip through
 * right at the exact boundary of the limit under concurrent load, which
 * is acceptable for a usage safeguard (unlike, say, a financial ledger
 * where that imprecision would not be).
 */
async function assertMonthlyLimitsNotExceeded(organizationId: string): Promise<void> {
  const env = getServerEnv();
  if (
    env.AI_MONTHLY_GENERATION_LIMIT_PER_ORG === undefined &&
    env.AI_MONTHLY_SPEND_LIMIT_CENTS === undefined
  ) {
    return;
  }

  const events = await db.aiUsageEvent.findMany({
    where: { organizationId, createdAt: { gte: startOfCurrentMonth() } },
    select: { estimatedCostCents: true },
  });

  if (
    env.AI_MONTHLY_GENERATION_LIMIT_PER_ORG !== undefined &&
    events.length >= env.AI_MONTHLY_GENERATION_LIMIT_PER_ORG
  ) {
    throw new MonthlyGenerationQuotaExceededError();
  }

  if (env.AI_MONTHLY_SPEND_LIMIT_CENTS !== undefined) {
    // Only a real, computed cost can be compared against a real spend
    // limit (AI_COST_PER_1K_*_TOKENS_CENTS, src/lib/env.ts) — without a
    // configured rate, every event's estimatedCostCents is null and this
    // check must stay a disclosed no-op, never a fabricated enforcement
    // against a cost of zero.
    const hasAnyCostedEvent = events.some((event) => event.estimatedCostCents !== null);
    if (hasAnyCostedEvent) {
      const totalCostCents = events.reduce(
        (sum, event) => sum + (event.estimatedCostCents ?? 0),
        0,
      );
      if (totalCostCents >= env.AI_MONTHLY_SPEND_LIMIT_CENTS) {
        throw new MonthlySpendLimitExceededError();
      }
    }
  }
}

/**
 * DB-backed concurrency tracking (AiGenerationLease, prisma/schema.prisma)
 * — correct across multiple server processes, not just one process's
 * in-memory counter. Same pg_advisory_xact_lock-serializes-the-
 * check-then-act-race pattern as assertNotLoginRateLimited
 * (src/lib/auth/login-rate-limit.ts): the lock is scoped to this
 * transaction only, so unrelated organizations never block each other.
 */
async function acquireGenerationLease(organizationId: string): Promise<string> {
  const env = getServerEnv();
  const staleBefore = new Date(Date.now() - LEASE_STALE_MS);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;

    // Opportunistic cleanup of a crashed process's abandoned lease — no
    // separate scheduled job required, since every acquisition attempt
    // for this organization sweeps its own stale rows first.
    await tx.aiGenerationLease.deleteMany({
      where: { organizationId, createdAt: { lt: staleBefore } },
    });

    const activeCount = await tx.aiGenerationLease.count({ where: { organizationId } });
    if (activeCount >= env.AI_MAX_CONCURRENT_GENERATIONS_PER_ORG) {
      throw new ConcurrentGenerationLimitError();
    }

    const lease = await tx.aiGenerationLease.create({ data: { organizationId } });
    return lease.id;
  });
}

/**
 * The single choke point every real AI generation must pass through
 * before calling the provider (intent-resolver.ts, semantic-extraction.ts)
 * — checks the monthly quota/spend caps, then acquires a concurrency
 * lease. Callers must release the returned handle in a `finally` block
 * around the actual provider call, so a lease is never left held after a
 * generation completes, fails, or throws.
 */
export async function beginGeneration(
  organizationId: string,
): Promise<{ release: () => Promise<void> }> {
  await assertMonthlyLimitsNotExceeded(organizationId);
  const leaseId = await acquireGenerationLease(organizationId);

  return {
    release: async () => {
      // A double-release (e.g. the staleness sweep above already
      // reclaimed this exact row) is harmless, not an error.
      await db.aiGenerationLease.delete({ where: { id: leaseId } }).catch(() => undefined);
    },
  };
}
