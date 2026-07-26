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

/**
 * The public counterpart to resolveProjectForRoute — for a generated
 * product's own real, unauthenticated end user, who has no Pocket Studio
 * account or org membership to check. Deliberately performs no
 * requireProjectAccess call: the org/project slugs are a public routing
 * key for the generated app's own customer-facing routes (Master Spec
 * §25), not a Pocket-Studio-side authorization boundary. Every subsequent,
 * data-touching call on this route still authorizes separately via
 * requireGeneratedAppSessionForProject (generated-app-session.ts).
 */
export async function resolvePublicProjectForRoute(
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

  return { organization, project };
}

export async function resolveOrganizationForRoute(orgSlug: string): Promise<Organization> {
  const organization = await db.organization.findUnique({ where: { slug: orgSlug } });
  if (!organization) {
    notFound();
  }
  return organization;
}
