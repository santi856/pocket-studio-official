import {
  resolvePublicationForRoute,
  getPublishedBuildPlan,
} from "@/lib/deployment/public-resolver";
import { requirePublishedAppUserForPage } from "@/lib/deployment/require-published-app-user";
import { isPublicRouteRateLimited } from "@/lib/deployment/public-route-rate-limit";
import { getClientIp } from "@/lib/web/client-ip";
import { loadScreenDataForAppUser } from "@/lib/generation/generated-app-data";
import { bindScreenData } from "@/lib/generation/screen-data-binding";
import { submitPublishedAppRecordAction } from "@/lib/actions/publish-app-record-actions";
import { signOutPublishedAppUserAction } from "@/lib/actions/publish-app-auth-actions";
import { ComponentRenderer } from "@/components/renderer/component-renderer";
import type { ComponentNode } from "@/lib/generation/component-registry";

/**
 * Publishing Milestone 1 (2026-07-27): the real public entry point for a
 * published generated app — no Pocket Studio login, reached only via the
 * project's own stable /p/{publicSlug} URL. resolvePublicationForRoute
 * enforces the LIVE-only gate (draft, unpublished, suspended, or a
 * nonexistent slug all 404 identically — never a different response that
 * would let a visitor distinguish them). getPublishedBuildPlan fetches the
 * exact pinned Blueprint/BuildPlan version this publication is serving —
 * never "latest" — so a draft edit never changes what a signed-out visitor
 * sees until the project owner explicitly republishes.
 *
 * Reuses the identical Structured Renderer (ComponentRenderer) and
 * data-binding (bindScreenData) as the builder preview and the existing
 * org-scoped app route — only the resolution and authorization path
 * differs, exactly the same relationship those two routes already have to
 * each other.
 */
export default async function PublishedAppScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicSlug: string; screen: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { publicSlug, screen } = await params;
  const { error } = await searchParams;
  const screenName = decodeURIComponent(screen);

  const clientIp = await getClientIp();
  if (await isPublicRouteRateLimited(publicSlug, clientIp)) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Too many requests. Please try again in a moment.
        </p>
      </div>
    );
  }

  const { project, publication } = await resolvePublicationForRoute(publicSlug);
  const { generatedAppUser, token } = await requirePublishedAppUserForPage(publicSlug, project.id);

  const buildPlan = await getPublishedBuildPlan(publication);

  const componentStructure = buildPlan.componentStructure as Record<string, ComponentNode> | null;
  const screenNode = componentStructure?.[screenName];

  if (!screenNode) {
    return (
      <NoticePage publicSlug={publicSlug} userName={generatedAppUser.name}>
        Screen &ldquo;{screenName}&rdquo; is not part of the current app.
      </NoticePage>
    );
  }

  const dataDependencies = buildPlan.dataDependencies as Record<string, string[]> | null;
  const hasDataDependency = (dataDependencies?.[screenName]?.length ?? 0) > 0;
  const boundNode = hasDataDependency
    ? bindScreenData(
        screenNode,
        (await loadScreenDataForAppUser(token, project.id, screenName)).screenData,
      )
    : screenNode;

  const action = submitPublishedAppRecordAction.bind(null, publicSlug, screenName);
  const signOutAction = signOutPublishedAppUserAction.bind(null, publicSlug);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="border-b border-zinc-200 px-6 py-3 sm:px-10 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between text-sm">
          <span className="font-medium text-black dark:text-white">
            {project.name}
            {generatedAppUser.name ? ` — ${generatedAppUser.name}` : ""}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
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
  publicSlug,
  userName,
  children,
}: {
  publicSlug: string;
  userName: string | null;
  children: React.ReactNode;
}) {
  const signOutAction = signOutPublishedAppUserAction.bind(null, publicSlug);
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="border-b border-zinc-200 px-6 py-3 sm:px-10 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between text-sm">
          <span className="font-medium text-black dark:text-white">{userName ?? "Account"}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 text-sm text-zinc-600 sm:px-10 dark:text-zinc-400">
        {children}
      </main>
    </div>
  );
}
