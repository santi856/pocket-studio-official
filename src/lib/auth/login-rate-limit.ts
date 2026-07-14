import "server-only";
import { db } from "@/lib/db";

// 5 failed attempts within 15 minutes locks out further attempts against
// that email until the oldest attempt in the window ages out. Standard
// brute-force-resistance parameters (OWASP ASVS-adjacent), not tuned
// against real attack traffic yet — this is Phase 3's first hardening
// pass, not a final answer.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export class TooManyLoginAttemptsError extends Error {
  constructor() {
    super("Too many attempts. Try again in a few minutes.");
    this.name = "TooManyLoginAttemptsError";
  }
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checked before password verification runs, so a locked-out email never
 * pays the real scrypt cost — a cheap early exit is also the correct fix
 * for a would-be timing side channel between "locked out" and "checking
 * password."
 */
export async function assertNotLoginRateLimited(email: string): Promise<void> {
  const count = await db.loginAttempt.count({
    where: { email: normalize(email), createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
  });

  if (count >= MAX_ATTEMPTS) {
    throw new TooManyLoginAttemptsError();
  }
}

/**
 * Recorded for every failed attempt regardless of whether the email has an
 * account — an attacker probing for valid emails must see identical
 * rate-limit behavior either way (see the LoginAttempt model comment,
 * prisma/schema.prisma).
 */
export async function recordFailedLoginAttempt(email: string): Promise<void> {
  await db.loginAttempt.create({ data: { email: normalize(email) } });
}

/** A successful sign-in clears this email's history — no lingering penalty. */
export async function clearLoginAttempts(email: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { email: normalize(email) } });
}

/**
 * Opportunistic cleanup so the table stays bounded before real scheduled-
 * job infrastructure exists (Phase 3's observability/ops units) — not
 * required for correctness (assertNotLoginRateLimited only ever counts
 * within WINDOW_MS regardless of older rows), only for storage hygiene.
 */
export async function deleteOldLoginAttempts(): Promise<number> {
  const result = await db.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - WINDOW_MS) } },
  });
  return result.count;
}
