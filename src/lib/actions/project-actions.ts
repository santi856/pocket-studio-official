"use server";

import { redirect } from "next/navigation";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { db } from "@/lib/db";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";

export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const organization = await db.organization.findUnique({ where: { slug: organizationSlug } });
  if (!organization) {
    redirect("/dashboard");
  }

  if (!name) {
    redirect(`/org/${organizationSlug}?error=${encodeURIComponent("Project name is required.")}`);
  }

  // A forged organizationSlug pointing at a real organization the caller
  // isn't a member of must fail gracefully, not crash — same class of bug
  // fixed for page loads (D-0014), applied here to a Server Action.
  let project;
  try {
    project = await createProject({
      organizationId: organization.id,
      name,
      createdByUserId: user.id,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }

  redirect(`/org/${organizationSlug}/${project.slug}`);
}
