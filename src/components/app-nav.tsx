import Link from "next/link";
import { signOutAction } from "@/lib/actions/auth-actions";

export function AppNav({ userName }: { userName: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 sm:px-10 dark:border-zinc-800">
      <Link
        href="/dashboard"
        className="text-lg font-semibold tracking-tight text-black dark:text-white"
      >
        Pocket Studio
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {userName && <span className="text-zinc-600 dark:text-zinc-400">{userName}</span>}
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
