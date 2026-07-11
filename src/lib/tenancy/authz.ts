import "server-only";
import { db } from "@/lib/db";
import type { Membership, MembershipRole, Project } from "@/generated/prisma/client";

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const ROLE_RANK: Record<MembershipRole, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
};

function meetsMinimumRole(role: MembershipRole, minimumRole: MembershipRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

/**
 * The single choke point every tenant-scoped read/write must pass through.
 * Never trust an organizationId supplied by the client without checking it
 * against the caller's own memberships here first — that is what tenant
 * isolation means in this codebase (Master Spec §53).
 */
export async function requireOrganizationMembership(
  userId: string,
  organizationId: string,
  minimumRole: MembershipRole = "MEMBER",
): Promise<Membership> {
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });

  if (!membership || !meetsMinimumRole(membership.role, minimumRole)) {
    throw new ForbiddenError("You are not a member of this organization.");
  }

  return membership;
}

/**
 * Resolves the project's owning organization first, then checks membership
 * against *that* organization — never the organizationId a caller might
 * pass in, which could belong to a different tenant.
 */
export async function requireProjectAccess(
  userId: string,
  projectId: string,
  minimumRole: MembershipRole = "MEMBER",
): Promise<Project> {
  const project = await db.project.findUnique({ where: { id: projectId } });

  if (!project) {
    throw new ForbiddenError("Project not found.");
  }

  await requireOrganizationMembership(userId, project.organizationId, minimumRole);

  return project;
}
