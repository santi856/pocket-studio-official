import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  assertNotLoginRateLimited,
  normalizeLoginIdentity,
  recordFailedLoginAttempt,
} from "@/lib/auth/login-rate-limit";
import type { User } from "@/generated/prisma/client";

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Incorrect email or password.");
    this.name = "InvalidCredentialsError";
  }
}

const MIN_PASSWORD_LENGTH = 8;

export class WeakPasswordError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = "WeakPasswordError";
  }
}

/**
 * The sign-up form's `minLength={8}` is a client-side convenience only — a
 * direct Server Action POST (or any non-browser caller) bypasses it
 * entirely, so the actual guarantee has to live here (Master Spec §31:
 * authentication is a security requirement, not a UI nicety).
 */
export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<User> {
  const normalizedEmail = input.email.trim().toLowerCase();

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError();
  }

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const passwordHash = await hashPassword(input.password);

  return db.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: input.name?.trim() || null,
    },
  });
}

// A fixed-for-the-process-lifetime dummy hash, computed once and reused —
// scrypt's own cost is what matters for timing equivalence (P3-02
// regression repair, D-0053), not secrecy of the dummy value itself, so
// caching it is safe and avoids paying the real hashing cost twice on
// every single nonexistent-user request.
let cachedDummyHash: Promise<string> | undefined;
function getDummyPasswordHash(): Promise<string> {
  if (!cachedDummyHash) {
    cachedDummyHash = hashPassword(
      `dummy-${crypto.randomUUID()}-never-a-real-password-just-for-timing-equivalence`,
    );
  }
  return cachedDummyHash;
}

/**
 * Regression repair (P3-02 targeted review, D-0053): the nonexistent-user
 * path previously skipped verifyPassword entirely, making it measurably
 * faster than the wrong-password path (scrypt is deliberately slow) — a
 * real timing side channel that let an attacker distinguish "no such
 * account" from "account exists, wrong password" by response time alone,
 * even though the error message was already deliberately generic.
 * Hashing against a fixed dummy value whenever no real user exists closes
 * that gap: both paths now always pay the same real scrypt cost.
 *
 * The whole check-verify-record sequence runs in one transaction so the
 * rate-limit check (assertNotLoginRateLimited) and the resulting record/
 * lastLoginAt update are atomic with respect to concurrent requests for
 * the same (email, ipAddress) pair — see that function's own docstring.
 * Deliberately never *throws* from inside that transaction for a failed
 * login: Prisma rolls back the entire transaction on any callback error,
 * which would silently discard the very failure record the rate limiter
 * depends on (a real bug caught by this fix's own regression tests — the
 * lockout never actually triggered under the first version of this
 * repair, because every recorded attempt was being rolled back the
 * instant it was written). The transaction always commits; only the
 * already-committed result decides whether the caller throws.
 */
export async function authenticateUser(input: {
  email: string;
  password: string;
  ipAddress: string;
}): Promise<User> {
  const normalizedEmail = normalizeLoginIdentity(input.email);

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: normalizedEmail } });

    await assertNotLoginRateLimited(
      tx,
      normalizedEmail,
      input.ipAddress,
      user?.lastLoginAt ?? null,
    );

    const hashToVerify = user?.passwordHash ?? (await getDummyPasswordHash());
    const passwordMatches = await verifyPassword(input.password, hashToVerify);

    if (!user || !passwordMatches) {
      await recordFailedLoginAttempt(tx, normalizedEmail, input.ipAddress);
      return { status: "invalid" as const };
    }

    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { status: "success" as const, user };
  });

  if (result.status === "invalid") {
    throw new InvalidCredentialsError();
  }
  return result.user;
}
