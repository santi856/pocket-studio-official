"use server";

import { redirect } from "next/navigation";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import {
  publishProject,
  unpublishProject,
  restoreLastKnownGoodVersion,
  NoGenerationToPublishError,
  NothingToUnpublishError,
  NoLastKnownGoodVersionError,
  PublishedVersionNoLongerExistsError,
} from "@/lib/deployment/publishing";
import {
  PublishNotAllowedError,
  PublishingAccessRestrictedError,
} from "@/lib/billing/entitlements";

function publishPagePath(orgSlug: string, projectSlug: string): string {
  return `/org/${orgSlug}/${projectSlug}/publish`;
}

/**
 * Every one of these three actions shares the same graceful-failure shape:
 * a known, typed error redirects back to the Publish page with a specific,
 * user-facing message — never a raw stack trace or an unhandled crash page.
 */
function redirectWithError(orgSlug: string, projectSlug: string, message: string): never {
  redirect(`${publishPagePath(orgSlug, projectSlug)}?error=${encodeURIComponent(message)}`);
}

export async function publishProjectAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await publishProject(user.id, project.id);
  } catch (error) {
    if (
      error instanceof NoGenerationToPublishError ||
      error instanceof PublishNotAllowedError ||
      error instanceof PublishingAccessRestrictedError
    ) {
      redirectWithError(orgSlug, projectSlug, error.message);
    }
    throw error;
  }

  redirect(publishPagePath(orgSlug, projectSlug));
}

export async function unpublishProjectAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await unpublishProject(user.id, project.id);
  } catch (error) {
    if (error instanceof NothingToUnpublishError) {
      redirectWithError(orgSlug, projectSlug, error.message);
    }
    throw error;
  }

  redirect(publishPagePath(orgSlug, projectSlug));
}

export async function restoreLastKnownGoodAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await restoreLastKnownGoodVersion(user.id, project.id);
  } catch (error) {
    if (
      error instanceof NoLastKnownGoodVersionError ||
      error instanceof PublishedVersionNoLongerExistsError ||
      error instanceof PublishNotAllowedError ||
      error instanceof PublishingAccessRestrictedError
    ) {
      redirectWithError(orgSlug, projectSlug, error.message);
    }
    throw error;
  }

  redirect(publishPagePath(orgSlug, projectSlug));
}
