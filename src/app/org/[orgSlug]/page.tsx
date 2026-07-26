import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserForPage } from "@/lib/web/require-user";
import { ForbiddenError, requireOrganizationMembership } from "@/lib/tenancy/authz";
import { resolveOrganizationForRoute } from "@/lib/web/resolve-project";
import { listProjectsForOrganization } from "@/lib/services/projects";
import { createProjectAction } from "@/lib/actions/project-actions";
import {
  requestAccountDeletionAction,
  cancelAccountDeletionAction,
} from "@/lib/actions/account-deletion-actions";
import { getAccountDeletionStatus } from "@/lib/billing/account-deletion";
import { AppNav } from "@/components/app-nav";

export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUserForPage();
  const { orgSlug } = await params;
  const { error } = await searchParams;

  const organization = await resolveOrganizationForRoute(orgSlug);
  let membership;
  try {
    membership = await requireOrganizationMembership(user.id, organization.id, "MEMBER");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      notFound();
    }
    throw err;
  }

  const projects = await listProjectsForOrganization(user.id, organization.id);
  const isOwner = membership.role === "OWNER";
  const pendingDeletion = isOwner ? await getAccountDeletionStatus(user.id, organization.id) : null;
  const requestDeletionAction = requestAccountDeletionAction.bind(null, organization.slug);
  const cancelDeletionAction = cancelAccountDeletionAction.bind(null, organization.slug);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppNav userName={user.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-10">
        <h1 className="text-xl font-semibold text-black dark:text-white">{organization.name}</h1>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        <ul className="mt-6 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {projects.length === 0 && (
            <li className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">No projects yet.</li>
          )}
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/org/${organization.slug}/${project.slug}`}
                className="block px-4 py-3 text-sm text-black transition-colors hover:bg-zinc-50 dark:text-white dark:hover:bg-zinc-900"
              >
                {project.name}
              </Link>
            </li>
          ))}
        </ul>

        <form action={createProjectAction} className="mt-8 flex gap-2">
          <input type="hidden" name="organizationSlug" value={organization.slug} />
          <input
            name="name"
            type="text"
            required
            placeholder="New project name"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Create
          </button>
        </form>

        {isOwner && (
          <div className="mt-16 rounded-lg border border-red-200 p-4 dark:border-red-900">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
            {pendingDeletion ? (
              <>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  This organization and all its projects are scheduled for permanent deletion on{" "}
                  {pendingDeletion.scheduledPurgeAt.toLocaleDateString()}. This cannot be undone
                  once it happens.
                </p>
                <form action={cancelDeletionAction} className="mt-4">
                  <button
                    type="submit"
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
                  >
                    Cancel deletion
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Permanently delete this organization and all its projects, generated app data, and
                  integration credentials. Billing and invoice records are kept for legal and
                  accounting purposes. There is a 30-day grace period to cancel before anything is
                  deleted.
                </p>
                <form action={requestDeletionAction} className="mt-4">
                  <button
                    type="submit"
                    className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    Delete this organization
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
