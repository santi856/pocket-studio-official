import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { requireOrganizationMembership } from "@/lib/tenancy/authz";
import { assertWithinProjectLimit } from "@/lib/billing/entitlements";
import type { Project } from "@/generated/prisma/client";

async function generateUniqueProjectSlug(organizationId: string, name: string): Promise<string> {
  const base = slugify(name) || "project";
  let candidate = base;
  let suffix = 1;

  while (
    await db.project.findUnique({
      where: { organizationId_slug: { organizationId, slug: candidate } },
    })
  ) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

/**
 * Every write goes through requireOrganizationMembership first — this is
 * the tenant-isolation boundary, not a client-trusted organizationId.
 */
export async function createProject(input: {
  organizationId: string;
  name: string;
  createdByUserId: string;
}): Promise<Project> {
  await requireOrganizationMembership(input.createdByUserId, input.organizationId, "MEMBER");
  await assertWithinProjectLimit(input.createdByUserId, input.organizationId);

  const slug = await generateUniqueProjectSlug(input.organizationId, input.name);

  return db.project.create({
    data: {
      organizationId: input.organizationId,
      name: input.name.trim(),
      slug,
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function listProjectsForOrganization(
  requestingUserId: string,
  organizationId: string,
): Promise<Project[]> {
  await requireOrganizationMembership(requestingUserId, organizationId, "MEMBER");

  return db.project.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
}
