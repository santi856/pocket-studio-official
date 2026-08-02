"use server";

import { redirect } from "next/navigation";
import {
  signUpGeneratedAppUser,
  authenticateGeneratedAppUser,
  GeneratedAppEmailAlreadyRegisteredError,
  GeneratedAppWeakPasswordError,
  InvalidGeneratedAppCredentialsError,
} from "@/lib/generation/generated-app-auth";
import { resolvePublicationForRoute } from "@/lib/deployment/public-resolver";
import {
  createGeneratedAppSession,
  deleteGeneratedAppSessionByToken,
} from "@/lib/generation/generated-app-session";
import {
  setGeneratedAppSessionCookie,
  clearGeneratedAppSessionCookie,
  getGeneratedAppSessionTokenFromCookies,
} from "@/lib/generation/generated-app-cookies";

/**
 * Mirrors src/lib/actions/generated-app-auth-actions.ts exactly, bound by
 * publicSlug instead of (orgSlug, projectSlug) — the published-app
 * counterpart, for a signed-out visitor reaching a project only through
 * its public URL. resolvePublicationForRoute enforces the same LIVE-only
 * gate every other public-route entry point uses; a slug pointing at a
 * non-LIVE publication 404s here exactly as it does for the render route.
 */
export async function signUpPublishedAppUserAction(
  publicSlug: string,
  formData: FormData,
): Promise<void> {
  const { project } = await resolvePublicationForRoute(publicSlug);
  const basePath = `/p/${publicSlug}`;

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");

  let user;
  try {
    user = await signUpGeneratedAppUser(project.id, email, password, name);
  } catch (error) {
    if (
      error instanceof GeneratedAppEmailAlreadyRegisteredError ||
      error instanceof GeneratedAppWeakPasswordError
    ) {
      redirect(`${basePath}/sign-up?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  const { token, expiresAt } = await createGeneratedAppSession(user.id);
  await setGeneratedAppSessionCookie(project.id, token, expiresAt);
  redirect(basePath);
}

export async function signInPublishedAppUserAction(
  publicSlug: string,
  formData: FormData,
): Promise<void> {
  const { project } = await resolvePublicationForRoute(publicSlug);
  const basePath = `/p/${publicSlug}`;

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  let user;
  try {
    user = await authenticateGeneratedAppUser(project.id, email, password);
  } catch (error) {
    if (error instanceof InvalidGeneratedAppCredentialsError) {
      redirect(`${basePath}/sign-in?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  const { token, expiresAt } = await createGeneratedAppSession(user.id);
  await setGeneratedAppSessionCookie(project.id, token, expiresAt);
  redirect(basePath);
}

export async function signOutPublishedAppUserAction(publicSlug: string): Promise<void> {
  const { project } = await resolvePublicationForRoute(publicSlug);

  const token = await getGeneratedAppSessionTokenFromCookies(project.id);
  if (token) {
    await deleteGeneratedAppSessionByToken(token);
  }
  await clearGeneratedAppSessionCookie(project.id);
  redirect(`/p/${publicSlug}/sign-in`);
}
