"use server";

import { redirect } from "next/navigation";
import { requireCurrentUserForAction } from "@/lib/web/require-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { beginChangeFlow, respondToChangeSetDecision } from "@/lib/orchestration/change-flow";
import { DecisionNotPendingError } from "@/lib/product/decisions";
import { getLatestProductState, updateUnitEconomicsAssumptions } from "@/lib/product/product-state";
import { defaultUnitEconomicsAssumptions } from "@/lib/orchestration/unit-economics";
import type { UnitEconomicsAssumptions } from "@/lib/orchestration/unit-economics";
import { AnthropicRequestError, AnthropicResponseFormatError } from "@/lib/ai/anthropic-provider";
import {
  ConcurrentGenerationLimitError,
  MonthlyGenerationQuotaExceededError,
  MonthlySpendLimitExceededError,
} from "@/lib/ai/generation-limits";
import {
  assertNotSubmissionRateLimited,
  SubmissionRateLimitedError,
} from "@/lib/orchestration/submission-rate-limit";

// A one- or two-word submission ("app", "hi") gives the deterministic
// pipeline nothing real to work with — reject it with an honest message
// instead of silently no-opping (the previous behavior: an empty/blank
// submission redirected back with zero feedback, as if nothing had been
// clicked at all).
const MIN_IDEA_LENGTH = 10;

export async function submitIdeaAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  if (text.length < MIN_IDEA_LENGTH) {
    // Recoverable failure preserves input (Example App Ideas picker vertical
    // proof, P2-EXIT): the attempted text travels through the redirect via
    // `text=`, so the customer's own typing — or their example-chip
    // selection — is never silently discarded just because it needs more
    // detail before it's actionable.
    redirect(
      `/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(
        "Describe your idea in a bit more detail before sending.",
      )}&text=${encodeURIComponent(text)}`,
    );
  }

  try {
    // Abuse protection (Master Spec — production-safe AI usage controls):
    // every submission reaches the paid AI provider at minimum via
    // resolveIntent, so unbounded submission volume is unbounded spend.
    await assertNotSubmissionRateLimited(user.id);
    await beginChangeFlow(user.id, project.id, text);
  } catch (error) {
    // Same "recoverable failure preserves input" discipline this function
    // already applies to a too-short idea above — the customer's exact
    // text survives every one of these graceful-failure redirects.
    if (
      error instanceof SubmissionRateLimitedError ||
      error instanceof ConcurrentGenerationLimitError ||
      error instanceof MonthlyGenerationQuotaExceededError ||
      error instanceof MonthlySpendLimitExceededError
    ) {
      redirect(
        `/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(error.message)}&text=${encodeURIComponent(text)}`,
      );
    }
    // Real, confirmed failure mode (staging-readiness sprint, 2026-07-26):
    // resolveIntent's real Anthropic call path had no retry of its own
    // (unlike extractProductSemantics, which retries then falls back to
    // the deterministic heuristic extractor) — a live-provider timeout,
    // rejection, or malformed response previously propagated uncaught
    // all the way to Next.js's default error page, discarding whatever
    // the customer had just typed. Both call sites now retry a
    // configurable number of times internally (AI_MAX_RETRIES_PER_GENERATION,
    // anthropic-provider.ts) before either of these errors ever reaches
    // here, but a genuinely exhausted retry budget must still fail this
    // gracefully, not crash.
    if (error instanceof AnthropicRequestError || error instanceof AnthropicResponseFormatError) {
      redirect(
        `/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent(
          "The AI provider did not respond correctly. Please try again.",
        )}&text=${encodeURIComponent(text)}`,
      );
    }
    throw error;
  }

  redirect(`/org/${orgSlug}/${projectSlug}`);
}

export async function respondToDecisionAction(formData: FormData): Promise<void> {
  const user = await requireCurrentUserForAction();
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const projectSlug = String(formData.get("projectSlug") ?? "");
  const decisionId = String(formData.get("decisionId") ?? "");
  const approve = formData.get("approve") === "true";

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  // A double-click (or a slow connection racing a second submit) can send
  // this form twice before the first response navigates the page away.
  // respondToDecision() already guards against double-responding at the
  // service layer (DecisionNotPendingError) — this must fail gracefully
  // back to the Studio page, not crash, the same discipline already
  // applied to createProjectAction for a forged cross-tenant slug.
  try {
    await respondToChangeSetDecision(user.id, project.id, decisionId, { approve });
  } catch (error) {
    if (error instanceof DecisionNotPendingError) {
      redirect(
        `/org/${orgSlug}/${projectSlug}?error=${encodeURIComponent("This decision was already responded to.")}`,
      );
    }
    throw error;
  }

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
  const user = await requireCurrentUserForAction();
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
