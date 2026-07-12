"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { createProject } from "@/lib/services/projects";

export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUser();
  const organizationSlug = String(formData.get("organizationSlug") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const organization = await db.organization.findUnique({ where: { slug: organizationSlug } });
  if (!organization) {
    redirect("/dashboard");
  }

  if (!name) {
    redirect(`/org/${organizationSlug}?error=${encodeURIComponent("Project name is required.")}`);
  }

  const project = await createProject({
    organizationId: organization.id,
    name,
    createdByUserId: user.id,
  });

  redirect(`/org/${organizationSlug}/${project.slug}`);
}
