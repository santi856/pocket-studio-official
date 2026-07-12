import { redirect } from "next/navigation";
import { requireUserForPage } from "@/lib/web/require-user";
import { listOrganizationsForUser } from "@/lib/services/organizations";
import { createOrganizationAction } from "@/lib/actions/organization-actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUserForPage();
  const { error } = await searchParams;

  const existingOrganizations = await listOrganizationsForUser(user.id);
  if (existingOrganizations.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">
          Name your workspace
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This is where your products, team, and billing live. You can rename it later.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        <form action={createOrganizationAction} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-black dark:text-white">Workspace name</span>
            <input
              name="name"
              type="text"
              required
              placeholder="e.g. Jesse's Studio"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
