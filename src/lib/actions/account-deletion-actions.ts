"use server";

import { redirect } from "next/navigation";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { resolveOrganizationForRoute } from "@/lib/web/resolve-project";
import {
  requestAccountDeletion,
  cancelAccountDeletionRequest,
  AccountDeletionAlreadyPendingError,
  NoAccountDeletionPendingError,
} from "@/lib/billing/account-deletion";
import { ForbiddenError } from "@/lib/tenancy/authz";

export async function requestAccountDeletionAction(orgSlug: string): Promise<void> {
  const user = await requireCurrentUserForAction();
  const organization = await resolveOrganizationForRoute(orgSlug);

  try {
    await requestAccountDeletion(user.id, organization.id);
  } catch (error) {
    if (error instanceof AccountDeletionAlreadyPendingError || error instanceof ForbiddenError) {
      redirect(`/org/${orgSlug}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/org/${orgSlug}`);
}

export async function cancelAccountDeletionAction(orgSlug: string): Promise<void> {
  const user = await requireCurrentUserForAction();
  const organization = await resolveOrganizationForRoute(orgSlug);

  try {
    await cancelAccountDeletionRequest(user.id, organization.id);
  } catch (error) {
    if (error instanceof NoAccountDeletionPendingError || error instanceof ForbiddenError) {
      redirect(`/org/${orgSlug}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/org/${orgSlug}`);
}
