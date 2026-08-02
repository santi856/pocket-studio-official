import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { BuildPlan, Project, ProjectPublication } from "@/generated/prisma/client";

/**
 * The public counterpart to resolveProjectForRoute/resolvePublicProjectForRoute
 * (src/lib/web/resolve-project.ts) — resolves a ProjectPublication's own
 * publicSlug to its project, but ONLY when the publication is genuinely
 * LIVE. Every other case — no such slug at all, or a real slug whose
 * publication is DRAFT/UNPUBLISHED/SUSPENDED/PUBLISH_FAILED — resolves to
 * the exact same Next.js notFound(), so a visitor probing slugs can never
 * distinguish "never existed" from "exists but is not currently public"
 * (the public-route threat model, docs/PUBLISHING.md). publicSlug is
 * deliberately independent of any organization/project slug, so this
 * resolver never has an org identity to leak in the first place.
 */
export async function resolvePublicationForRoute(
  publicSlug: string,
): Promise<{ project: Project; publication: ProjectPublication }> {
  const publication = await db.projectPublication.findUnique({ where: { publicSlug } });
  if (!publication || publication.status !== "LIVE") {
    notFound();
  }

  const project = await db.project.findUnique({ where: { id: publication.projectId } });
  if (!project) {
    notFound();
  }

  return { project, publication };
}

/**
 * The exact pinned BuildPlan version this publication is currently serving
 * — never "latest". A LIVE publication's publishedBuildPlanVersion is
 * always non-null by construction (publishProject only ever sets status
 * LIVE together with both version fields in the same write), but this
 * queries by the explicit version number regardless, so a bug elsewhere
 * can never silently fall back to "whatever is newest."
 */
export async function getPublishedBuildPlan(publication: ProjectPublication): Promise<BuildPlan> {
  if (publication.publishedBuildPlanVersion === null) {
    notFound();
  }

  const buildPlan = await db.buildPlan.findUnique({
    where: {
      projectId_version: {
        projectId: publication.projectId,
        version: publication.publishedBuildPlanVersion,
      },
    },
  });
  if (!buildPlan) {
    notFound();
  }

  return buildPlan;
}
