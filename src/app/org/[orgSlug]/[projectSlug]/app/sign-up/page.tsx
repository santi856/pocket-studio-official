import Link from "next/link";
import { resolvePublicProjectForRoute } from "@/lib/web/resolve-project";
import { signUpGeneratedAppUserAction } from "@/lib/actions/generated-app-auth-actions";

/**
 * Real, unauthenticated sign-up for a generated product's own end
 * customer (Master Spec §25/§67) — no Pocket Studio account or org
 * membership required to reach this page, mirroring src/app/sign-up
 * but for the GeneratedAppUser identity domain.
 */
export default async function GeneratedAppSignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; projectSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgSlug, projectSlug } = await params;
  const { project } = await resolvePublicProjectForRoute(orgSlug, projectSlug);
  const { error } = await searchParams;
  const action = signUpGeneratedAppUserAction.bind(null, orgSlug, projectSlug);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">
          Create your {project.name} account
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href={`/org/${orgSlug}/${projectSlug}/app/sign-in`}
            className="font-medium text-black underline dark:text-white"
          >
            Sign in
          </Link>
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        <form action={action} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-black dark:text-white">Name</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-black dark:text-white">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-black dark:text-white">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="submit"
            className="mt-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Create account
          </button>
        </form>
      </div>
    </div>
  );
}
