import "server-only";
import { redirect } from "next/navigation";
import { getGeneratedAppSessionTokenFromCookies } from "./generated-app-cookies";
import { requireGeneratedAppSessionForProject } from "./generated-app-session";
import type { GeneratedAppUser } from "@/generated/prisma/client";

/**
 * Page-level auth guard for a generated product's own customer-facing
 * screens — the requireUserForPage (src/lib/web/require-user.ts)
 * equivalent for the GeneratedAppUser identity domain: an unauthenticated
 * visitor lands on that generated app's own sign-in page, not a thrown
 * error or someone else's screens.
 */
export async function requireGeneratedAppUserForPage(
  orgSlug: string,
  projectSlug: string,
  projectId: string,
): Promise<{ generatedAppUser: GeneratedAppUser; token: string }> {
  const token = await getGeneratedAppSessionTokenFromCookies(projectId);
  if (!token) {
    redirect(`/org/${orgSlug}/${projectSlug}/app/sign-in`);
  }

  try {
    const generatedAppUser = await requireGeneratedAppSessionForProject(token, projectId);
    return { generatedAppUser, token };
  } catch {
    redirect(`/org/${orgSlug}/${projectSlug}/app/sign-in`);
  }
}
