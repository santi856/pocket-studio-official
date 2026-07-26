import { resolvePublicProjectForRoute } from "@/lib/web/resolve-project";
import { requireGeneratedAppUserForPage } from "@/lib/generation/require-generated-app-user";
import { loadScreenDataForAppUser } from "@/lib/generation/generated-app-data";
import { bindScreenData } from "@/lib/generation/screen-data-binding";
import { submitGeneratedAppRecordAction } from "@/lib/actions/generated-app-record-actions";
import { signOutGeneratedAppUserAction } from "@/lib/actions/generated-app-auth-actions";
import { ComponentRenderer } from "@/components/renderer/component-renderer";
import { db } from "@/lib/db";
import type { ComponentNode } from "@/lib/generation/component-registry";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug, projectSlug } = await params;
  return { manifest: `/org/${orgSlug}/${projectSlug}/manifest.webmanifest` };
}

/**
 * The real, unauthenticated-until-signed-in customer-facing counterpart to
 * the builder preview route (.../preview/[screen]/page.tsx): a generated
 * product's own real end user reaches a working screen here, authorized
 * by their own GeneratedAppSession rather than a Pocket Studio platform
 * session. Reuses the same Structured Renderer (ComponentRenderer) and
 * data-binding (bindScreenData) as the builder preview — only the
 * authorization and data-loading path (generated-app-data.ts) differs.
 */
export default async function GeneratedAppScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string; screen: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgSlug, projectSlug, screen } = await params;
  const { error } = await searchParams;
  const screenName = decodeURIComponent(screen);
  const { project } = await resolvePublicProjectForRoute(orgSlug, projectSlug);
  const { generatedAppUser, token } = await requireGeneratedAppUserForPage(
    orgSlug,
    projectSlug,
    project.id,
  );

  const buildPlan = await db.buildPlan.findFirst({
    where: { projectId: project.id },
    orderBy: { version: "desc" },
  });

  if (!buildPlan) {
    return (
      <NoticePage orgSlug={orgSlug} projectSlug={projectSlug} userName={generatedAppUser.name}>
        This app isn&rsquo;t ready yet — no version has been generated.
      </NoticePage>
    );
  }

  const componentStructure = buildPlan.componentStructure as Record<string, ComponentNode> | null;
  const screenNode = componentStructure?.[screenName];

  if (!screenNode) {
    return (
      <NoticePage orgSlug={orgSlug} projectSlug={projectSlug} userName={generatedAppUser.name}>
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

  const action = submitGeneratedAppRecordAction.bind(null, orgSlug, projectSlug, screenName);
  const signOutAction = signOutGeneratedAppUserAction.bind(null, orgSlug, projectSlug);

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
      <script
        dangerouslySetInnerHTML={{
          __html: `if ("serviceWorker" in navigator) { navigator.serviceWorker.register(${JSON.stringify(`/org/${orgSlug}/${projectSlug}/sw.js`)}); }`,
        }}
      />
    </div>
  );
}

function NoticePage({
  orgSlug,
  projectSlug,
  userName,
  children,
}: {
  orgSlug: string;
  projectSlug: string;
  userName: string | null;
  children: React.ReactNode;
}) {
  const signOutAction = signOutGeneratedAppUserAction.bind(null, orgSlug, projectSlug);
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
