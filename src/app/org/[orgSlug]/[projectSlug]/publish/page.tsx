import { headers } from "next/headers";
import { requireUserForPage } from "@/lib/web/require-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { getPublication } from "@/lib/deployment/publishing";
import { getPublishedBuildPlan } from "@/lib/deployment/public-resolver";
import { getLatestBlueprint } from "@/lib/generation/blueprint";
import { getLatestBuildPlan } from "@/lib/generation/build-plan";
import { AppNav } from "@/components/app-nav";
import {
  publishProjectAction,
  unpublishProjectAction,
  restoreLastKnownGoodAction,
} from "@/lib/actions/publish-actions";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Not published yet",
  PUBLISHING: "Publishing…",
  LIVE: "Live",
  PUBLISH_FAILED: "Last publish attempt failed",
  UNPUBLISHED: "Unpublished",
  SUSPENDED: "Publishing paused",
};

export default async function PublishPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUserForPage();
  const { orgSlug, projectSlug } = await params;
  const { error } = await searchParams;
  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  const [publication, latestBlueprint, latestBuildPlan] = await Promise.all([
    getPublication(user.id, project.id),
    getLatestBlueprint(user.id, project.id),
    getLatestBuildPlan(user.id, project.id),
  ]);

  const hasUnpublishedChanges =
    !!latestBlueprint &&
    !!latestBuildPlan &&
    (publication?.publishedBlueprintVersion !== latestBlueprint.version ||
      publication?.publishedBuildPlanVersion !== latestBuildPlan.version);

  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const host = requestHeaders.get("host");
  const origin = `${protocol}://${host}`;

  let publicUrl: string | null = null;
  if (publication?.status === "LIVE") {
    const publishedBuildPlan = await getPublishedBuildPlan(publication);
    const screenOrder = publishedBuildPlan.screenOrder as string[];
    const firstScreen = screenOrder[0];
    publicUrl = firstScreen
      ? `${origin}/p/${publication.publicSlug}/${encodeURIComponent(firstScreen)}`
      : `${origin}/p/${publication.publicSlug}`;
  }

  const canPublish = !!latestBlueprint && !!latestBuildPlan;
  const isLive = publication?.status === "LIVE";
  const isSuspended = publication?.status === "SUSPENDED";
  const canRestore =
    publication?.lastKnownGoodBlueprintVersion != null &&
    publication?.lastKnownGoodBuildPlanVersion != null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={user.name} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10 sm:px-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">Publish</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Make a specific, explicit version of {project.name} reachable at a stable public URL —
          served by Pocket Studio&rsquo;s own shared runtime, not a separate hosting account.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-medium text-black dark:text-white">
              {STATUS_LABEL[publication?.status ?? "DRAFT"]}
            </span>
            {publication && (
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {publication.status}
              </span>
            )}
          </div>

          {isSuspended && publication?.suspensionReason && (
            <p className="mt-2 text-sm text-orange-700 dark:text-orange-400">
              Publishing is paused — resolve your workspace&rsquo;s billing status to go live again.
              ({publication.suspensionReason})
            </p>
          )}

          {publicUrl && (
            <p className="mt-3 text-sm">
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-black underline dark:text-white"
              >
                {publicUrl}
              </a>
            </p>
          )}

          {publication?.publishedAt && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
              Last published {new Date(publication.publishedAt).toLocaleString()} — Blueprint v
              {publication.publishedBlueprintVersion}, Build Plan v
              {publication.publishedBuildPlanVersion}.
            </p>
          )}

          {hasUnpublishedChanges && isLive && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
              You have unpublished changes — the public URL still shows the version above until you
              publish the update.
            </p>
          )}

          {!canPublish && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Generate this project first — there is no Blueprint or Build Plan to publish yet.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {canPublish && (
              <form action={publishProjectAction}>
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="projectSlug" value={projectSlug} />
                <button
                  type="submit"
                  className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {isLive ? "Publish update" : "Publish"}
                </button>
              </form>
            )}

            {isLive && (
              <form action={unpublishProjectAction}>
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="projectSlug" value={projectSlug} />
                <button
                  type="submit"
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-black hover:bg-zinc-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
                >
                  Unpublish
                </button>
              </form>
            )}

            {canRestore && (
              <form action={restoreLastKnownGoodAction}>
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="projectSlug" value={projectSlug} />
                <button
                  type="submit"
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-black hover:bg-zinc-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
                >
                  Restore previous version (v{publication?.lastKnownGoodBlueprintVersion})
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
