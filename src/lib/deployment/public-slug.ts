import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

/**
 * Names that would be confusing or unsafe as a project's public identity —
 * either because they collide in spirit with real routes nested under
 * /p/{publicSlug}/* (sign-in, sign-up, sign-out) or because they read as
 * platform/system surfaces rather than a customer's own product (Master
 * Spec's "never expose internal project state" extended to naming, not
 * just data). Checked case-insensitively; never assignable, with or
 * without a numeric suffix.
 */
const RESERVED_PUBLIC_SLUGS: ReadonlySet<string> = new Set([
  "sign-in",
  "sign-up",
  "sign-out",
  "api",
  "admin",
  "app",
  "org",
  "dashboard",
  "onboarding",
  "static",
  "assets",
  "health",
  "webhooks",
  "www",
  "mail",
  "ftp",
  "null",
  "undefined",
  "p",
]);

export function isReservedPublicSlug(candidate: string): boolean {
  return RESERVED_PUBLIC_SLUGS.has(candidate.toLowerCase());
}

/**
 * Same normalization as project/organization slugs (src/lib/slug.ts) —
 * lowercase, ASCII-alphanumeric with hyphens, no leading/trailing hyphen,
 * bounded length. A publicSlug is a real, public path segment
 * (/p/{publicSlug}/...), so it is validated against exactly the character
 * set that is safe there — no path separators, no encoded characters, no
 * empty result.
 */
export function normalizePublicSlugCandidate(input: string): string {
  return slugify(input);
}

/**
 * Generates a unique, non-reserved public slug from a project's own name,
 * appending a numeric suffix on collision — the same collision-handling
 * pattern generateUniqueProjectSlug (src/lib/services/projects.ts) already
 * uses for project slugs, applied to the separate, globally-unique
 * ProjectPublication.publicSlug namespace. Immutable once assigned (the
 * pilot's publish flow only ever calls this the first time a project is
 * published — see src/lib/deployment/publishing.ts).
 */
export async function generateUniquePublicSlug(name: string): Promise<string> {
  const base = normalizePublicSlugCandidate(name) || "app";
  const baseCandidate = isReservedPublicSlug(base) ? `${base}-app` : base;

  let candidate = baseCandidate;
  let suffix = 1;

  while (
    isReservedPublicSlug(candidate) ||
    (await db.projectPublication.findUnique({ where: { publicSlug: candidate } }))
  ) {
    suffix += 1;
    candidate = `${baseCandidate}-${suffix}`;
  }

  return candidate;
}
