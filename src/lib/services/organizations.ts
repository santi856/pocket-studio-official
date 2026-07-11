import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { Organization } from "@/generated/prisma/client";

async function generateUniqueOrganizationSlug(name: string): Promise<string> {
  const base = slugify(name) || "organization";
  let candidate = base;
  let suffix = 1;

  while (await db.organization.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

/**
 * Creates an organization and its founding OWNER membership atomically —
 * an organization must never exist without at least one owner able to
 * administer it.
 */
export async function createOrganization(input: {
  name: string;
  ownerUserId: string;
}): Promise<Organization> {
  const slug = await generateUniqueOrganizationSlug(input.name);

  return db.organization.create({
    data: {
      name: input.name.trim(),
      slug,
      memberships: {
        create: {
          userId: input.ownerUserId,
          role: "OWNER",
        },
      },
    },
  });
}

export async function listOrganizationsForUser(userId: string): Promise<Organization[]> {
  return db.organization.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: "asc" },
  });
}
