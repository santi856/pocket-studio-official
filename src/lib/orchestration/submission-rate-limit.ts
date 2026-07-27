import "server-only";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

export class SubmissionRateLimitedError extends Error {
  constructor() {
    super("Too many submissions. Please wait a moment before trying again.");
    this.name = "SubmissionRateLimitedError";
  }
}

/**
 * Abuse protection on idea/edit submission (Master Spec — production-safe
 * AI usage controls) — every submission reaches the paid AI provider
 * (resolveIntent, at minimum), so unbounded submission volume is
 * unbounded spend, not just unbounded traffic. Same DB-backed, sliding-
 * window, pg_advisory_xact_lock-serialized pattern as
 * assertNotLoginRateLimited (src/lib/auth/login-rate-limit.ts) — keyed by
 * the already-authenticated userId rather than an (email, ipAddress)
 * pair, since a submission (unlike a login attempt) always has a real
 * signed-in actor to key by.
 *
 * Must be called, and the resulting attempt recorded, as a single unit
 * (this function does both atomically) so concurrent submissions from
 * the same user cannot all read the same pre-burst count before any of
 * them commits — the same check-then-act race assertNotLoginRateLimited
 * closes for login.
 */
export async function assertNotSubmissionRateLimited(actorUserId: string): Promise<void> {
  const env = getServerEnv();
  const maxAttempts = env.AI_SUBMISSION_RATE_LIMIT_MAX_ATTEMPTS;
  const windowMs = env.AI_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS * 1000;

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actorUserId}))`;

    const windowStart = new Date(Date.now() - windowMs);
    const count = await tx.ideaSubmissionAttempt.count({
      where: { userId: actorUserId, createdAt: { gt: windowStart } },
    });

    if (count >= maxAttempts) {
      throw new SubmissionRateLimitedError();
    }

    await tx.ideaSubmissionAttempt.create({ data: { userId: actorUserId } });
  });
}
