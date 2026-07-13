"use server";

import { redirect } from "next/navigation";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { NoGenerationToCheckError, runQualityGate } from "@/lib/generation/quality-gate";
import {
  NoBlueprintForStoreReadinessError,
  assessStoreReadiness,
} from "@/lib/generation/store-readiness";
import { NoBlueprintForMobileProjectError, generateMobileProject } from "@/lib/generation/mobile";
import {
  NoBlueprintForAssessmentError,
  generatePolicyDraft,
  type GeneratablePolicyDocumentType,
} from "@/lib/orchestration/governance-and-legal";
import {
  BlueprintVersionNotFoundError,
  restoreBlueprintVersion,
} from "@/lib/orchestration/version-history";

/**
 * Every action below follows the same shape already established across
 * this codebase (generation-actions.ts, studio-actions.ts): re-resolve
 * tenant access from the slugs, run the already-tested service function,
 * and fail back to the Studio page with an honest message rather than a
 * crash page (D-0018) for every foreseeable error. None of these render
 * their own result — the Studio page's Trust section already displays
 * each action's real outcome (Truth Status + rationale) once it re-renders
 * after the redirect, so there is nothing to pass through the redirect
 * itself.
 */

export async function runQualityGateAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await runQualityGate(user.id, project.id);
  } catch (error) {
    if (error instanceof NoGenerationToCheckError) {
      redirect(`/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}

export async function assessStoreReadinessAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await assessStoreReadiness(user.id, project.id);
  } catch (error) {
    if (error instanceof NoBlueprintForStoreReadinessError) {
      redirect(`/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}

export async function generateMobileProjectAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await generateMobileProject(user.id, project.id);
  } catch (error) {
    if (error instanceof NoBlueprintForMobileProjectError) {
      redirect(`/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}

const GENERATABLE_POLICY_TYPES: readonly GeneratablePolicyDocumentType[] = [
  "TERMS_OF_SERVICE",
  "PRIVACY_POLICY",
  "AI_DISCLOSURE",
];

export async function generatePolicyDraftAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const type = String(formData.get("type") ?? "");
  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  if (!GENERATABLE_POLICY_TYPES.includes(type as GeneratablePolicyDocumentType)) {
    redirect(
      `/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent("Unknown policy document type.")}`,
    );
  }

  try {
    await generatePolicyDraft(user.id, project.id, type as GeneratablePolicyDocumentType);
  } catch (error) {
    if (error instanceof NoBlueprintForAssessmentError) {
      redirect(`/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}

export async function restoreBlueprintVersionAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const targetVersion = Number(formData.get("targetVersion"));
  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  try {
    await restoreBlueprintVersion(user.id, project.id, targetVersion);
  } catch (error) {
    if (error instanceof BlueprintVersionNotFoundError) {
      redirect(`/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}
