"use server";

import { redirect } from "next/navigation";
import {
  signUpGeneratedAppUser,
  authenticateGeneratedAppUser,
  GeneratedAppEmailAlreadyRegisteredError,
  GeneratedAppWeakPasswordError,
  InvalidGeneratedAppCredentialsError,
} from "@/lib/generation/generated-app-auth";
import { resolvePublicProjectForRoute } from "@/lib/web/resolve-project";
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
 * Mirrors src/lib/actions/auth-actions.ts's signUpAction/signInAction/signOutAction
 * exactly (resolve → verify/create → issue or clear session cookie →
 * redirect), for the separate GeneratedAppUser identity domain. Bound with
 * (orgSlug, projectSlug) by the calling form, the same convention
 * src/lib/actions/generation-actions.ts already uses for
 * submitGeneratedRecordAction.
 */
export async function signUpGeneratedAppUserAction(
  orgSlug: string,
  projectSlug: string,
  formData: FormData,
): Promise<void> {
  const { project } = await resolvePublicProjectForRoute(orgSlug, projectSlug);
  const appBasePath = `/org/${orgSlug}/${projectSlug}/app`;

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
      redirect(`${appBasePath}/sign-up?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  const { token, expiresAt } = await createGeneratedAppSession(user.id);
  await setGeneratedAppSessionCookie(project.id, token, expiresAt);
  redirect(appBasePath);
}

export async function signInGeneratedAppUserAction(
  orgSlug: string,
  projectSlug: string,
  formData: FormData,
): Promise<void> {
  const { project } = await resolvePublicProjectForRoute(orgSlug, projectSlug);
  const appBasePath = `/org/${orgSlug}/${projectSlug}/app`;

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  let user;
  try {
    user = await authenticateGeneratedAppUser(project.id, email, password);
  } catch (error) {
    if (error instanceof InvalidGeneratedAppCredentialsError) {
      redirect(`${appBasePath}/sign-in?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  const { token, expiresAt } = await createGeneratedAppSession(user.id);
  await setGeneratedAppSessionCookie(project.id, token, expiresAt);
  redirect(appBasePath);
}

export async function signOutGeneratedAppUserAction(
  orgSlug: string,
  projectSlug: string,
): Promise<void> {
  const { project } = await resolvePublicProjectForRoute(orgSlug, projectSlug);

  const token = await getGeneratedAppSessionTokenFromCookies(project.id);
  if (token) {
    await deleteGeneratedAppSessionByToken(token);
  }
  await clearGeneratedAppSessionCookie(project.id);
  redirect(`/org/${orgSlug}/${projectSlug}/app/sign-in`);
}
