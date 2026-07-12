import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white dark:bg-black">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-lg font-semibold tracking-tight text-black dark:text-white">
          Pocket Studio
        </span>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-black px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-full bg-black px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center sm:px-10">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-black sm:text-5xl dark:text-white">
          Describe the product you want to create.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Pocket Studio helps you understand it, design it, build it, launch it, operate it, and
          improve it — and it never lies about what has actually been completed.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Start building
          </Link>
          <Link
            href="/sign-in"
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-black transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-white dark:hover:border-zinc-500"
          >
            Sign in
          </Link>
        </div>

        <dl className="mt-20 grid max-w-3xl grid-cols-1 gap-8 text-left sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-black dark:text-white">Product Truth</dt>
            <dd className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Every claim distinguishes proposed, designed, implemented, tested, and deployed.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-black dark:text-white">
              Consequence-Aware Editing
            </dt>
            <dd className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              A request changes the complete affected system, not just the visible screen.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-black dark:text-white">
              Business Intelligence
            </dt>
            <dd className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Understand how your product earns money, what it costs, and what it takes to run.
            </dd>
          </div>
        </dl>
      </main>

      <footer className="px-6 py-8 text-center text-xs text-zinc-500 sm:px-10">
        Pocket Studio is in active development. Capabilities are labeled truthfully — see Trust in
        every project.
      </footer>
    </div>
  );
}
