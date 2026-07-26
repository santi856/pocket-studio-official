import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { GeneratedAppUser } from "@/generated/prisma/client";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class InvalidGeneratedAppSessionError extends Error {
  constructor() {
    super("Your session has expired. Please sign in again.");
    this.name = "InvalidGeneratedAppSessionError";
  }
}

/**
 * Same construction as src/lib/auth/session.ts's hashToken: only a
 * SHA-256 hash of the token is ever stored, so a database read can never
 * be replayed as a live session.
 */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createGeneratedAppSession(
  generatedAppUserId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.generatedAppSession.create({
    data: { generatedAppUserId, tokenHash: hashToken(token), expiresAt },
  });

  return { token, expiresAt };
}

/**
 * The Generated-App-User identity domain's own authorization choke point
 * — src/lib/tenancy/verify-tenant-isolation.ts recognizes this alongside
 * requireProjectAccess/requireOrganizationMembership as an authz root a
 * tenant-scoped function may transitively reach. A GeneratedAppUser is not
 * a Pocket Studio platform member, so requireProjectAccess does not apply;
 * this performs the equivalent check for this identity domain: a valid,
 * unexpired session whose owner genuinely belongs to the exact project
 * being requested. The projectId check is not redundant with the session
 * lookup itself — a session token is real proof of *an* identity, but
 * only this comparison proves that identity belongs to *this* project,
 * which is what stops one generated app's customer from using their own
 * valid session to reach a different generated app's data.
 */
export async function requireGeneratedAppSessionForProject(
  rawToken: string,
  projectId: string,
): Promise<GeneratedAppUser> {
  const session = await db.generatedAppSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { generatedAppUser: true },
  });

  if (
    !session ||
    session.expiresAt < new Date() ||
    session.generatedAppUser.projectId !== projectId
  ) {
    throw new InvalidGeneratedAppSessionError();
  }

  return session.generatedAppUser;
}

export async function deleteGeneratedAppSessionByToken(rawToken: string): Promise<void> {
  await db.generatedAppSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}
