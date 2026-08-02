"use server";

import { redirect } from "next/navigation";
import { resolvePublicationForRoute } from "@/lib/deployment/public-resolver";
import { submitScreenRecordForAppUser } from "@/lib/generation/generated-app-data";
import { getGeneratedAppSessionTokenFromCookies } from "@/lib/generation/generated-app-cookies";
import { InvalidGeneratedAppSessionError } from "@/lib/generation/generated-app-session";
import { InvalidRecordDataError, UnknownDataModelError } from "@/lib/generation/generated-records";

/**
 * The published-app counterpart to submitGeneratedAppRecordAction
 * (src/lib/actions/generated-app-record-actions.ts), bound by publicSlug.
 */
export async function submitPublishedAppRecordAction(
  publicSlug: string,
  screenName: string,
  formData: FormData,
): Promise<void> {
  const { project } = await resolvePublicationForRoute(publicSlug);
  const screenPath = `/p/${publicSlug}/${screenName}`;

  const token = await getGeneratedAppSessionTokenFromCookies(project.id);
  if (!token) {
    redirect(`/p/${publicSlug}/sign-in`);
  }

  const data: Record<string, string> = {};
  formData.forEach((value, key) => {
    data[key] = String(value);
  });

  try {
    await submitScreenRecordForAppUser(token, project.id, screenName, data);
  } catch (error) {
    if (error instanceof InvalidGeneratedAppSessionError) {
      redirect(`/p/${publicSlug}/sign-in`);
    }
    if (error instanceof InvalidRecordDataError || error instanceof UnknownDataModelError) {
      redirect(`${screenPath}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(screenPath);
}
