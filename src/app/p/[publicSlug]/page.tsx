import { redirect } from "next/navigation";
import {
  resolvePublicationForRoute,
  getPublishedBuildPlan,
} from "@/lib/deployment/public-resolver";
import { requirePublishedAppUserForPage } from "@/lib/deployment/require-published-app-user";
import type { ComponentNode } from "@/lib/generation/component-registry";

/**
 * The /p/{publicSlug} index — mirrors src/app/org/[orgSlug]/[projectSlug]/app/page.tsx
 * exactly: no screen of its own, authenticates (or sends an unauthenticated
 * visitor to this publication's own sign-in), then forwards to the
 * PUBLISHED Build Plan's first screen — never "latest" (getPublishedBuildPlan
 * fetches the exact pinned version, the same discipline the render route
 * itself follows).
 */
export default async function PublishedAppIndexPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;
  const { project, publication } = await resolvePublicationForRoute(publicSlug);
  await requirePublishedAppUserForPage(publicSlug, project.id);

  const buildPlan = await getPublishedBuildPlan(publication);
  const componentStructure = buildPlan.componentStructure as Record<string, ComponentNode> | null;
  const firstScreen = componentStructure ? Object.keys(componentStructure)[0] : undefined;

  if (!firstScreen) {
    redirect(`/p/${publicSlug}/sign-in?error=${encodeURIComponent("This app isn't ready yet.")}`);
  }

  redirect(`/p/${publicSlug}/${encodeURIComponent(firstScreen)}`);
}
