import "server-only";
import { db } from "@/lib/db";
import { ForbiddenError } from "./authz";
import type { PlatformAdmin } from "@/generated/prisma/client";

/**
 * Master Spec §61 "internal administrative operations". A separate
 * authorization root from requireProjectAccess/requireOrganizationMembership
 * (src/lib/tenancy/authz.ts) — platform-admin authority is deliberately
 * cross-tenant, never derived from any single organization's own
 * membership. A real, auditable grant (PlatformAdmin: who, by whom, when,
 * and any revocation) rather than a bare boolean flag with no history.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const grant = await db.platformAdmin.findUnique({ where: { userId } });
  return grant !== null && grant.revokedAt === null;
}

export async function requirePlatformAdmin(userId: string): Promise<void> {
  if (!(await isPlatformAdmin(userId))) {
    throw new ForbiddenError("This action requires platform administrator access.");
  }
}

export class LastPlatformAdminError extends Error {
  constructor() {
    super("Cannot revoke the last remaining platform administrator.");
    this.name = "LastPlatformAdminError";
  }
}

export class AlreadyPlatformAdminError extends Error {
  constructor() {
    super("This user is already a platform administrator.");
    this.name = "AlreadyPlatformAdminError";
  }
}

/**
 * Bootstraps the very first platform administrator: when zero active
 * grants exist anywhere, any authenticated user may call this (typically
 * to grant themselves access) — the standard "first user becomes admin"
 * pattern for a system with no other admin yet to perform the grant.
 * Once at least one active admin exists, only an existing admin may grant
 * another.
 */
export async function grantPlatformAdmin(
  actorUserId: string,
  targetUserId: string,
): Promise<PlatformAdmin> {
  const existingActiveAdminCount = await db.platformAdmin.count({ where: { revokedAt: null } });
  if (existingActiveAdminCount > 0) {
    await requirePlatformAdmin(actorUserId);
  }

  const existing = await db.platformAdmin.findUnique({ where: { userId: targetUserId } });
  if (existing && existing.revokedAt === null) {
    throw new AlreadyPlatformAdminError();
  }

  return db.platformAdmin.upsert({
    where: { userId: targetUserId },
    create: { userId: targetUserId, grantedByUserId: actorUserId },
    update: {
      grantedByUserId: actorUserId,
      grantedAt: new Date(),
      revokedAt: null,
      revokedByUserId: null,
    },
  });
}

export class PlatformAdminNotFoundError extends Error {
  constructor() {
    super("This user does not have an active platform administrator grant.");
    this.name = "PlatformAdminNotFoundError";
  }
}

export async function revokePlatformAdmin(
  actorUserId: string,
  targetUserId: string,
): Promise<PlatformAdmin> {
  await requirePlatformAdmin(actorUserId);

  const target = await db.platformAdmin.findUnique({ where: { userId: targetUserId } });
  if (!target || target.revokedAt !== null) {
    throw new PlatformAdminNotFoundError();
  }

  const activeAdminCount = await db.platformAdmin.count({ where: { revokedAt: null } });
  if (activeAdminCount <= 1) {
    throw new LastPlatformAdminError();
  }

  return db.platformAdmin.update({
    where: { userId: targetUserId },
    data: { revokedAt: new Date(), revokedByUserId: actorUserId },
  });
}

export async function listPlatformAdmins(actorUserId: string): Promise<PlatformAdmin[]> {
  await requirePlatformAdmin(actorUserId);

  return db.platformAdmin.findMany({
    where: { revokedAt: null },
    orderBy: { grantedAt: "asc" },
  });
}
