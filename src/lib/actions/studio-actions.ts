"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { beginChangeFlow } from "@/lib/orchestration/change-flow";
import { respondToDecision } from "@/lib/product/decisions";
import { getLatestProductState, updateUnitEconomicsAssumptions } from "@/lib/product/product-state";
import { defaultUnitEconomicsAssumptions } from "@/lib/orchestration/unit-economics";
import type { UnitEconomicsAssumptions } from "@/lib/orchestration/unit-economics";

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

const UNIT_ECONOMICS_FIELDS = [
  "price",
  "revenuePerCustomer",
  "transactionValue",
  "transactionFrequencyPerMonth",
  "paymentFeesPercent",
  "hostingCostPerMonth",
  "aiCostPerMonth",
  "storageCostPerMonth",
  "supportCostPerMonth",
  "grossMarginPercent",
  "breakEvenCustomerCount",
] as const satisfies readonly (keyof UnitEconomicsAssumptions)[];

/**
 * Master Spec §20: unit-economics assumptions must be editable. A field
 * left blank in the form carries its previous value forward unchanged; a
 * field the customer fills in is recorded with source "user_provided" —
 * never silently reclassified as a platform "estimate."
 */
export async function updateUnitEconomicsAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUser();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  const latestState = await getLatestProductState(user.id, project.id);
  const current =
    (latestState?.unitEconomicsAssumptions as UnitEconomicsAssumptions | null) ??
    defaultUnitEconomicsAssumptions();

  const updated: UnitEconomicsAssumptions = { ...current };
  for (const field of UNIT_ECONOMICS_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        updated[field] = { value: parsed, source: "user_provided" };
      }
    }
  }

  await updateUnitEconomicsAssumptions(user.id, project.id, updated);

  redirect(`/org/${orgSlug}/${projectSlug}`);
}
