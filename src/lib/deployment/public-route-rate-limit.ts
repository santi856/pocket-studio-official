import "server-only";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

/**
 * Basic abuse protection for the public render route (Publishing Milestone
 * 1) — same DB-backed, sliding-window, pg_advisory_xact_lock-serialized
 * pattern as assertNotLoginRateLimited (src/lib/auth/login-rate-limit.ts)
 * and assertNotSubmissionRateLimited
 * (src/lib/orchestration/submission-rate-limit.ts), keyed by
 * (publicSlug, ipAddress) rather than an authenticated userId — a
 * published app's visitors have no Pocket Studio account to key by. A
 * caller that exceeds this returns `false` rather than throwing: the
 * calling page renders a plain "try again shortly" notice, not a crash.
 */
export async function isPublicRouteRateLimited(
  publicSlug: string,
  ipAddress: string,
): Promise<boolean> {
  const env = getServerEnv();
  const maxAttempts = env.PUBLIC_ROUTE_RATE_LIMIT_MAX_ATTEMPTS;
  const windowMs = env.PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS * 1000;

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${publicSlug}), hashtext(${ipAddress}))`;

    const windowStart = new Date(Date.now() - windowMs);
    const count = await tx.publicRouteRequest.count({
      where: { publicSlug, ipAddress, createdAt: { gt: windowStart } },
    });

    if (count >= maxAttempts) {
      return true;
    }

    await tx.publicRouteRequest.create({ data: { publicSlug, ipAddress } });
    return false;
  });
}
