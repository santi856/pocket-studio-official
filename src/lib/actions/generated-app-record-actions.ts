"use server";

import { redirect } from "next/navigation";
import { resolvePublicProjectForRoute } from "@/lib/web/resolve-project";
import { submitScreenRecordForAppUser } from "@/lib/generation/generated-app-data";
import { getGeneratedAppSessionTokenFromCookies } from "@/lib/generation/generated-app-cookies";
import { InvalidGeneratedAppSessionError } from "@/lib/generation/generated-app-session";
import { InvalidRecordDataError, UnknownDataModelError } from "@/lib/generation/generated-records";

/**
 * The generated-app-end-user counterpart to submitGeneratedRecordAction
 * (src/lib/actions/generation-actions.ts), same bind/error-redirect shape,
 * authorizing via the visitor's own GeneratedAppSession instead of a
 * Pocket Studio platform session.
 */
export async function submitGeneratedAppRecordAction(
  orgSlug: string,
  projectSlug: string,
  screenName: string,
  formData: FormData,
): Promise<void> {
  const { project } = await resolvePublicProjectForRoute(orgSlug, projectSlug);
  const screenPath = `/org/${orgSlug}/${projectSlug}/app/${screenName}`;

  const token = await getGeneratedAppSessionTokenFromCookies(project.id);
  if (!token) {
    redirect(`/org/${orgSlug}/${projectSlug}/app/sign-in`);
  }

  const data: Record<string, string> = {};
  formData.forEach((value, key) => {
    data[key] = String(value);
  });

  try {
    await submitScreenRecordForAppUser(token, project.id, screenName, data);
  } catch (error) {
    if (error instanceof InvalidGeneratedAppSessionError) {
      redirect(`/org/${orgSlug}/${projectSlug}/app/sign-in`);
    }
    if (error instanceof InvalidRecordDataError || error instanceof UnknownDataModelError) {
      redirect(`${screenPath}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(screenPath);
}
