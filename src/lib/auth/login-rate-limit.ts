import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

// 5 failed attempts within 15 minutes throttles further attempts against
// that (email, IP) pair until the oldest attempt in the window ages out.
// Standard brute-force-resistance parameters, not tuned against real
// attack traffic yet — this is Phase 3's first hardening pass, not a
// final answer.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export class TooManyLoginAttemptsError extends Error {
  constructor() {
    super("Too many attempts. Try again in a few minutes.");
    this.name = "TooManyLoginAttemptsError";
  }
}

export function normalizeLoginIdentity(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Regression repair (P3-02 targeted review, D-0053) — fixes a real
 * check-then-act race: the previous version counted attempts, then only
 * recorded a new one *after* password verification finished. N concurrent
 * requests for the same identity could all read the same pre-burst count
 * before any of them committed a row, letting an attacker try far more
 * than MAX_ATTEMPTS passwords in one parallel burst.
 *
 * Must be called inside the same transaction as the password check and
 * any resulting recordFailedLoginAttempt/lastLoginAt update — the
 * Postgres advisory lock it takes only serializes concurrent callers for
 * the *life of that transaction*, closing the race for exactly the
 * duration that matters (check → verify → record) rather than just the
 * count query in isolation. Different (email, ipAddress) pairs never
 * block each other; only genuinely concurrent attempts against the exact
 * same pair are serialized, which is both rare in real traffic and
 * correct to serialize when it does happen.
 *
 * `lastLoginAt` bounds the counting window to attempts since the account
 * was last proven to belong to its owner, without ever deleting
 * LoginAttempt history (a real security audit trail must survive a
 * subsequent successful login, not be erased by it — see the User model
 * comment, prisma/schema.prisma).
 */
export async function assertNotLoginRateLimited(
  tx: Prisma.TransactionClient,
  email: string,
  ipAddress: string,
  lastLoginAt: Date | null,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}), hashtext(${ipAddress}))`;

  const windowStart = new Date(Date.now() - WINDOW_MS);
  const effectiveWindowStart = lastLoginAt && lastLoginAt > windowStart ? lastLoginAt : windowStart;

  const count = await tx.loginAttempt.count({
    where: { email, ipAddress, createdAt: { gt: effectiveWindowStart } },
  });

  if (count >= MAX_ATTEMPTS) {
    throw new TooManyLoginAttemptsError();
  }
}

/**
 * Recorded for every failed attempt regardless of whether the email has an
 * account — an attacker probing for valid emails must see identical
 * rate-limit behavior either way (see the LoginAttempt model comment,
 * prisma/schema.prisma). Must run in the same transaction as the
 * assertNotLoginRateLimited call that preceded it.
 */
export async function recordFailedLoginAttempt(
  tx: Prisma.TransactionClient,
  email: string,
  ipAddress: string,
): Promise<void> {
  await tx.loginAttempt.create({ data: { email, ipAddress } });
}

/**
 * Bounded storage hygiene, not required for correctness —
 * assertNotLoginRateLimited only ever counts rows inside the active
 * window regardless of how many older rows exist. No longer triggered
 * automatically on every successful login (that was both unbounded — a
 * full unfiltered table delete — and disproportionate to run as a
 * side-effect of an unrelated request's hot path); this is a real,
 * tested, batch-limited function ready for a scheduled-job unit to call
 * on a real interval once that infrastructure exists (the same disclosed
 * gap already noted for P3-04's time-based billing transitions).
 */
export async function deleteOldLoginAttempts(batchSize = 1000): Promise<number> {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  const deleted = await db.$executeRaw`
    DELETE FROM "login_attempts"
    WHERE "id" IN (
      SELECT "id" FROM "login_attempts" WHERE "createdAt" < ${cutoff} LIMIT ${batchSize}
    )
  `;
  return deleted;
}
