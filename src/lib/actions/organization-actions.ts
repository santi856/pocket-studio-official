"use server";

import { redirect } from "next/navigation";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { createOrganization } from "@/lib/services/organizations";
import { createSubscription } from "@/lib/billing/subscription";

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect(`/onboarding?error=${encodeURIComponent("Organization name is required.")}`);
  }

  const organization = await createOrganization({ name, ownerUserId: user.id });
  await createSubscription(user.id, organization.id);

  redirect(`/org/${organization.slug}`);
}
