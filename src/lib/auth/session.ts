import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * The raw token lives only in the client's cookie. The database stores a
 * SHA-256 hash of it, so a database read (backup, leaked query log, etc.)
 * can never be replayed as a live session.
 */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function verifySessionToken(
  rawToken: string,
): Promise<{ user: User; sessionId: string } | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return { user: session.user, sessionId: session.id };
}

export async function deleteSessionByToken(rawToken: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}

export async function deleteExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
