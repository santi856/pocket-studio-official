import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type { Organization, Project } from "@/generated/prisma/client";

/**
 * Shared route-param resolver: turns (orgSlug, projectSlug) into a
 * tenant-checked Project. Every Studio page calls this first so a
 * mistyped or cross-tenant slug renders Next.js's standard 404 rather
 * than leaking whether the slug exists for someone else's organization.
 */
export async function resolveProjectForRoute(
  actorUserId: string,
  orgSlug: string,
  projectSlug: string,
): Promise<{ organization: Organization; project: Project }> {
  const organization = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!organization) {
    notFound();
  }

  const project = await db.project.findUnique({
    where: { organizationId_slug: { organizationId: organization.id, slug: projectSlug } },
  });
  if (!project) {
    notFound();
  }

  try {
    await requireProjectAccess(actorUserId, project.id, "MEMBER");
  } catch {
    notFound();
  }

  return { organization, project };
}

export async function resolveOrganizationForRoute(orgSlug: string): Promise<Organization> {
  const organization = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!organization) {
    notFound();
  }
  return organization;
}
