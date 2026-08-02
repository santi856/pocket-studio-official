import "server-only";
import { redirect } from "next/navigation";
import { getGeneratedAppSessionTokenFromCookies } from "@/lib/generation/generated-app-cookies";
import { requireGeneratedAppSessionForProject } from "@/lib/generation/generated-app-session";
import type { GeneratedAppUser } from "@/generated/prisma/client";

/**
 * The published-app counterpart to requireGeneratedAppUserForPage
 * (src/lib/generation/require-generated-app-user.ts) — identical
 * mechanism (the underlying GeneratedAppSession cookie is already keyed by
 * projectId, not by orgSlug/projectSlug), only the redirect target differs:
 * an unauthenticated visitor lands on this publication's own public
 * sign-in page, never Pocket Studio's internal org-scoped one.
 */
export async function requirePublishedAppUserForPage(
  publicSlug: string,
  projectId: string,
): Promise<{ generatedAppUser: GeneratedAppUser; token: string }> {
  const token = await getGeneratedAppSessionTokenFromCookies(projectId);
  if (!token) {
    redirect(`/p/${publicSlug}/sign-in`);
  }

  try {
    const generatedAppUser = await requireGeneratedAppSessionForProject(token, projectId);
    return { generatedAppUser, token };
  } catch {
    redirect(`/p/${publicSlug}/sign-in`);
  }
}
