import { redirect } from "next/navigation";
import { resolvePublicProjectForRoute } from "@/lib/web/resolve-project";
import { requireGeneratedAppUserForPage } from "@/lib/generation/require-generated-app-user";
import { db } from "@/lib/db";
import type { ComponentNode } from "@/lib/generation/component-registry";

/**
 * The `/app` index has no screen of its own — it authenticates (or sends
 * an unauthenticated visitor to sign-in via requireGeneratedAppUserForPage)
 * and then forwards to the current Build Plan's first defined screen, the
 * same "no hardcoded screen name" discipline the rest of generation
 * already follows (Master Spec §26).
 */
export default async function GeneratedAppIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}) {
  const { orgSlug, projectSlug } = await params;
  const { project } = await resolvePublicProjectForRoute(orgSlug, projectSlug);
  await requireGeneratedAppUserForPage(orgSlug, projectSlug, project.id);

  const buildPlan = await db.buildPlan.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
  });

  const componentStructure = buildPlan?.componentStructure as Record<string, ComponentNode> | null;
  const firstScreen = componentStructure ? Object.keys(componentStructure)[0] : undefined;

  if (!firstScreen) {
    redirect(
      `/org/${orgSlug}/${projectSlug}/app/sign-in?error=${encodeURIComponent("This app isn't ready yet.")}`,
    );
  }

  redirect(`/org/${orgSlug}/${projectSlug}/app/${encodeURIComponent(firstScreen)}`);
}
