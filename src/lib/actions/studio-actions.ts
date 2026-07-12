"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { beginChangeFlow } from "@/lib/orchestration/change-flow";
import { respondToDecision } from "@/lib/product/decisions";

export async function submitIdeaAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  if (text) {
    await beginChangeFlow(user.id, project.id, text);
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}

export async function respondToDecisionAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const decisionId = String(formData.get("decisionId") ?? "");
  const approve = formData.get("approve") === "true";

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);
  await respondToDecision(user.id, project.id, decisionId, { approve });

  redirect(`/org/${orgSlug}/${projectSlug}`);
}
