"use client";

/**
 * Staging-readiness gap this closes: no error.tsx or global-error.tsx
 * existed anywhere in this app before (verified: `find src/app -iname
 * "error.tsx" -o -iname "global-error.tsx"` returned nothing). Any
 * uncaught exception in a Server Component or Server Action — a real,
 * confirmed path: intent-resolver.ts's resolveIntent has no try/catch
 * around a live AI-provider call, so an Anthropic timeout or malformed
 * response on the very first customer action (submitting an idea)
 * propagated all the way to Next.js's bare default error page. This
 * boundary catches it within the app's own layout instead.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        This page hit an unexpected error. Your data has not been affected. You can try again, or go
        back and try a different action.
      </p>
      {error.digest && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Reference: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Try again
      </button>
    </div>
  );
}
