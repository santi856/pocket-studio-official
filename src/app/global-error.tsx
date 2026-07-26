"use client";

/**
 * The root-level fallback for an error thrown by the root layout itself
 * (error.tsx cannot catch that case — it renders inside the layout it's
 * meant to protect). Next.js requires this file to render its own
 * <html>/<body> since the real root layout may be exactly what failed.
 * Deliberately minimal, inline-styled (no Tailwind class dependency, no
 * font import) so it cannot itself fail from the same root-level problem
 * it exists to report.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "4rem 1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#a1a1aa" }}>
          Pocket Studio hit an unexpected error loading this page. Your data has not been affected.
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#71717a" }}>Reference: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            borderRadius: "9999px",
            backgroundColor: "#fafafa",
            color: "#0a0a0a",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
