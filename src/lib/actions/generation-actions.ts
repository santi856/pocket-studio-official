"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { generateApplication } from "@/lib/generation/generation-orchestrator";
import { submitScreenRecord } from "@/lib/generation/render-runtime";
import { InvalidRecordDataError, UnknownDataModelError } from "@/lib/generation/generated-records";
import { ForbiddenError } from "@/lib/tenancy/authz";

export async function generateApplicationAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await generateApplication(user.id, project.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect(
        `/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent("You cannot generate this app.")}`,
      );
    }
    throw error;
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}

/**
 * Bound with `.bind(null, orgSlug, projectSlug, screenName)` at the page
 * level before being passed as a Structured Renderer `action` prop — the
 * renderer's Form primitive is generic and does not know about a project
 * or screen, so the extra context travels via Next.js's supported "bound
 * arguments" Server Action pattern rather than hidden form fields.
 * Re-resolves tenant access from the slugs (not a passed id) — the same
 * discipline every other action in this codebase already follows.
 */
export async function submitGeneratedRecordAction(
  orgSlug: string,
  projectSlug: string,
  screenName: string,
  formData: FormData,
): Promise<void> {
  const user = await requireCurrentUser();
  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  const data: Record<string, string> = {};
  formData.forEach((value, key) => {
    data[key] = String(value);
  });

  const previewPath = `/org/${orgSlug}/${projectSlug}/preview/${screenName}`;

  try {
    await submitScreenRecord(user.id, project.id, screenName, data);
  } catch (error) {
    // A Build Plan's placeholder Form (P2-03) does not yet name its Input
    // after the data model's actual required fields — a real mismatch,
    // not a hypothetical one, until the generation pipeline generates
    // field-matched forms. Fail gracefully back to the same screen with an
    // honest message, the same discipline already applied to every other
    // foreseeable validation error in this codebase (D-0018).
    if (error instanceof InvalidRecordDataError || error instanceof UnknownDataModelError) {
      redirect(`${previewPath}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(previewPath);
}
