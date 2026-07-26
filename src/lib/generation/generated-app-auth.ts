import "server-only";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import type { GeneratedAppUser } from "@/generated/prisma/client";

export class InvalidGeneratedAppCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidGeneratedAppCredentialsError";
  }
}

export class GeneratedAppEmailAlreadyRegisteredError extends Error {
  constructor() {
    super("An account with this email already exists for this product.");
    this.name = "GeneratedAppEmailAlreadyRegisteredError";
  }
}

const MIN_PASSWORD_LENGTH = 8;

export class GeneratedAppWeakPasswordError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = "GeneratedAppWeakPasswordError";
  }
}

/** Every account for a given generated product is looked up by this normalized form. */
function normalizeGeneratedAppEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Real credential verification for a generated product's own end user
 * (Master Spec §25 "authentication") — distinct from Pocket Studio's own
 * platform sign-in (src/lib/auth/*), reusing the same password-hashing
 * primitives rather than a second implementation. Now wired into a real,
 * unauthenticated customer-facing route (src/app/org/[orgSlug]/[projectSlug]/app/sign-in)
 * via signInGeneratedAppUserAction, which creates the session (see
 * generated-app-session.ts) this function still deliberately does not
 * establish itself — the same login-then-session separation
 * src/lib/actions/auth-actions.ts already uses for platform sign-in.
 */
export async function authenticateGeneratedAppUser(
  projectId: string,
  email: string,
  password: string,
): Promise<GeneratedAppUser> {
  const user = await db.generatedAppUser.findUnique({
    where: { projectId_email: { projectId, email: normalizeGeneratedAppEmail(email) } },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new InvalidGeneratedAppCredentialsError();
  }

  return user;
}

/**
 * Self-service account creation for a generated product's own end user —
 * the counterpart to registerUser (src/lib/services/users.ts) for this
 * separate identity domain. `role` is not customer-chosen: every
 * self-service sign-up is the product's primary customer-facing role
 * ("customer"), matching Master Spec §67's acceptance-test customer
 * booking workflow. A Blueprint's other roles (e.g. an "owner"/business
 * side) remain reachable only through the existing Pocket-Studio-side
 * builder preview, unchanged by this addition.
 */
export async function signUpGeneratedAppUser(
  projectId: string,
  email: string,
  password: string,
  name: string | undefined,
): Promise<GeneratedAppUser> {
  const normalizedEmail = normalizeGeneratedAppEmail(email);

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new GeneratedAppWeakPasswordError();
  }

  const existing = await db.generatedAppUser.findUnique({
    where: { projectId_email: { projectId, email: normalizedEmail } },
  });
  if (existing) {
    throw new GeneratedAppEmailAlreadyRegisteredError();
  }

  const passwordHash = await hashPassword(password);

  return db.generatedAppUser.create({
    data: {
      projectId,
      email: normalizedEmail,
      passwordHash,
      name: name?.trim() || null,
      role: "customer",
    },
  });
}
