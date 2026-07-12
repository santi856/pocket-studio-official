import "server-only";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import type { GeneratedAppUser } from "@/generated/prisma/client";

export class InvalidGeneratedAppCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidGeneratedAppCredentialsError";
  }
}

/**
 * Real credential verification for a generated product's own end user
 * (Master Spec §25 "authentication") — distinct from Pocket Studio's own
 * platform sign-in (src/lib/auth/*), reusing the same password-hashing
 * primitives rather than a second implementation. Deliberately does not
 * establish a session/cookie by itself — that binding belongs to whichever
 * unit first serves an unauthenticated, customer-facing generated route
 * (a known limitation of this unit; today only the Pocket-Studio-side
 * project member can reach generated screens, via the existing platform
 * session and requireProjectAccess).
 */
export async function authenticateGeneratedAppUser(
  projectId: string,
  email: string,
  password: string,
): Promise<GeneratedAppUser> {
  const user = await db.generatedAppUser.findUnique({
    where: { projectId_email: { projectId, email } },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new InvalidGeneratedAppCredentialsError();
  }

  return user;
}
