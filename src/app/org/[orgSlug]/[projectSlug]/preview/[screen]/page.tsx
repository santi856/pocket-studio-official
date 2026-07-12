import Link from "next/link";
import { requireUserForPage } from "@/lib/web/require-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { getLatestBuildPlan } from "@/lib/generation/build-plan";
import { loadScreenData } from "@/lib/generation/render-runtime";
import { bindScreenData } from "@/lib/generation/screen-data-binding";
import { ComponentRenderer } from "@/components/renderer/component-renderer";
import { submitGeneratedRecordAction } from "@/lib/actions/generation-actions";
import { AppNav } from "@/components/app-nav";
import type { ComponentNode } from "@/lib/generation/component-registry";

/**
 * The live route P2-06 ties everything into: a project member reaches a
 * real, working screen interpreted from the current Build Plan's
 * `componentStructure` (P2-03) via the Structured Renderer (P2-05), bound
 * to real generated-app data (P2-04) through the Interactive Runtime
 * (render-runtime.ts). This is a builder-facing preview, gated by the same
 * platform session/tenant checks as every other Studio page — not yet the
 * separate, unauthenticated customer-facing route a real end user would
 * reach (that binding is a known limitation of this unit; see
 * generated-app-auth.ts).
 */
export default async function GeneratedScreenPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string; screen: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUserForPage();
  const { orgSlug, projectSlug, screen } = await params;
  const { error } = await searchParams;
  const screenName = decodeURIComponent(screen);
  const { organization, project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  const buildPlan = await getLatestBuildPlan(user.id, project.id);

  if (!buildPlan) {
    return (
      <NoticePage
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        orgName={organization.name}
        userName={user.name}
      >
        No Build Plan exists yet for this project.{" "}
        <Link href={`/org/${orgSlug}/${projectSlug}`} className="underline">
          Generate the app
        </Link>{" "}
        first.
      </NoticePage>
    );
  }

  const componentStructure = buildPlan.componentStructure as Record<string, ComponentNode> | null;
  const screenNode = componentStructure?.[screenName];

  if (!screenNode) {
    return (
      <NoticePage
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        orgName={organization.name}
        userName={user.name}
      >
        Screen &ldquo;{screenName}&rdquo; is not part of the current Build Plan.
      </NoticePage>
    );
  }

  const dataDependencies = buildPlan.dataDependencies as Record<string, string[]> | null;
  const hasDataDependency = (dataDependencies?.[screenName]?.length ?? 0) > 0;
  const boundNode = hasDataDependency
    ? bindScreenData(screenNode, await loadScreenData(user.id, project.id, screenName))
    : screenNode;

  const action = submitGeneratedRecordAction.bind(null, orgSlug, projectSlug, screenName);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={user.name} />
      <div className="border-b border-zinc-200 px-6 py-3 sm:px-10 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-500">
              {organization.name} / {project.name} /{" "}
            </span>
            <span className="font-medium text-black dark:text-white">Preview: {screenName}</span>
          </div>
          <Link
            href={`/org/${orgSlug}/${projectSlug}`}
            className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
          >
            Back to Studio
          </Link>
        </div>
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
        {error && (
          <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}
        <ComponentRenderer node={boundNode} action={action} />
      </main>
    </div>
  );
}

function NoticePage({
  orgSlug,
  projectSlug,
  orgName,
  userName,
  children,
}: {
  orgSlug: string;
  projectSlug: string;
  orgName: string;
  userName: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={userName} />
      <div className="border-b border-zinc-200 px-6 py-3 sm:px-10 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl text-sm">
          <span className="text-zinc-500 dark:text-zinc-500">{orgName} / </span>
          <span className="font-medium text-black dark:text-white">Preview</span>
        </div>
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 text-sm text-zinc-600 sm:px-10 dark:text-zinc-400">
        {children}
        <p className="mt-4">
          <Link href={`/org/${orgSlug}/${projectSlug}`} className="underline">
            Back to Studio
          </Link>
        </p>
      </main>
    </div>
  );
}
