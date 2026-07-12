import Link from "next/link";
import { requireUserForPage } from "@/lib/web/require-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { listProductStateVersions } from "@/lib/product/product-state";
import { listDecisions } from "@/lib/product/decisions";
import { listEvents } from "@/lib/product/events";
import { listLatestTruthStatuses } from "@/lib/product/truth-status";
import { AppNav } from "@/components/app-nav";
import { TruthBadge } from "@/components/truth-badge";

export default async function StudioExpertModePage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
}) {
  const user = await requireUserForPage();
  const { orgSlug, projectSlug } = await params;
  const { organization, project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  const [productStateVersions, decisions, events, truthStatuses] = await Promise.all([
    listProductStateVersions(user.id, project.id),
    listDecisions(user.id, project.id),
    listEvents(user.id, project.id),
    listLatestTruthStatuses(user.id, project.id),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={user.name} />
      <div className="border-b border-zinc-200 px-6 py-3 sm:px-10 dark:border-zinc-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-500">{organization.name} / </span>
            <span className="font-medium text-black dark:text-white">{project.name}</span>
            <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Expert Mode
            </span>
          </div>
          <Link
            href={`/org/${orgSlug}/${projectSlug}`}
            className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
          >
            Switch to Simple Mode
          </Link>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-4xl flex-1 grid-cols-1 gap-10 px-6 py-10 sm:px-10 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Canonical Product State ({productStateVersions.length} version
            {productStateVersions.length === 1 ? "" : "s"})
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {productStateVersions.map((state) => (
              <li
                key={state.id}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-black dark:text-white">v{state.version}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {state.createdAt.toISOString()}
                  </span>
                </div>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{state.originalIdea}</p>
              </li>
            ))}
            {productStateVersions.length === 0 && (
              <li className="text-sm text-zinc-500 dark:text-zinc-500">No versions yet.</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Truth Status
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {truthStatuses.map((status) => (
              <li
                key={status.id}
                className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <div>
                  <p className="text-black dark:text-white">{status.subjectLabel}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">{status.subjectKey}</p>
                </div>
                <TruthBadge status={status.status} />
              </li>
            ))}
            {truthStatuses.length === 0 && (
              <li className="text-sm text-zinc-500 dark:text-zinc-500">Nothing evaluated yet.</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Decision Ledger
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {decisions.map((decision) => (
              <li
                key={decision.id}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="text-black dark:text-white">{decision.summary}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    {decision.disclosureTier}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                  {decision.approvalStatus}
                </p>
              </li>
            ))}
            {decisions.length === 0 && (
              <li className="text-sm text-zinc-500 dark:text-zinc-500">
                No decisions recorded yet.
              </li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Event Ledger
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="text-black dark:text-white">{event.summary}</span>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                  {event.type} · {event.createdAt.toISOString()}
                </p>
              </li>
            ))}
            {events.length === 0 && (
              <li className="text-sm text-zinc-500 dark:text-zinc-500">No events recorded yet.</li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
