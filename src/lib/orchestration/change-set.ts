import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { recordEvent } from "@/lib/product/events";
import { getLatestProductState } from "@/lib/product/product-state";
import { getLatestSemanticModel } from "@/lib/product/semantic-model";
import { generateProductIntelligence } from "./product-intelligence";
import { generateApplication } from "@/lib/generation/generation-orchestrator";
import { deriveRequirements } from "./requirements-engine";
import { analyzeImpact } from "./impact-analysis";
import { extractSemanticsHeuristically } from "@/lib/ai/heuristic-extraction";
import type { SemanticActor, SemanticEntity } from "@/lib/ai/provider";
import type { ChangeSet } from "@/generated/prisma/client";

export class ChangeSetNotPendingError extends Error {
  constructor() {
    super("This Change Set is not pending — it has already been applied or rejected.");
    this.name = "ChangeSetNotPendingError";
  }
}

/**
 * Master Spec §27: a natural-language edit must "load Product State;
 * resolve intent; analyze impact; ...generate a structured Change Set."
 * This computes that structure without applying anything: what categories
 * this edit touches (Impact Analysis, reused from P1-04), and — by
 * deriving requirements from the prior idea and the combined
 * (prior + edit) idea and diffing their categories — which of those are
 * genuinely *new* versus already captured. `combinedIdea` never discards
 * the prior text, only appends to it, which is how "preserve unrelated
 * Product DNA and decisions" (§57) is achieved without a separate
 * incremental-diffing engine: nothing already said is ever dropped from
 * what the deterministic generators see.
 *
 * Founder-directed follow-up to D-0065: `addedCategories` alone is the
 * *old* (pre-semantic-compiler) signal for "does this edit need
 * regeneration" — it is driven by the same fixed 15-category keyword
 * classifier the semantic-hollowing defect was about in the first place.
 * An edit that introduces a genuinely new actor or entity in ordinary
 * language ("Also, nurses can review patient records") would previously
 * regenerate only by accident, if it happened to also trip an unrelated
 * category keyword — otherwise the semantic model (and therefore the
 * Blueprint) would never learn about it, even though `generateProductIntelligence`
 * (called below, only when regeneration happens) has run the real
 * Semantic Product Compiler on every first-time idea since D-0066. This
 * runs the same, free, deterministic heuristic extractor
 * (heuristic-extraction.ts) — never the paid AI provider, which only
 * runs once, for real, inside `applyChangeSet`'s actual regeneration
 * call below, avoiding a duplicate/wasted extraction — purely to detect
 * "did this edit's own text name an actor or entity the current semantic
 * model doesn't already have," and ORs that into `requiresRegeneration`
 * alongside the existing category check, never replacing it.
 */
export async function createChangeSet(
  actorUserId: string,
  projectId: string,
  input: { decisionId: string; rawText: string },
): Promise<ChangeSet> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const latestState = await getLatestProductState(actorUserId, projectId);
  const priorIdea = latestState?.originalIdea ?? "";
  const combinedIdea = priorIdea ? `${priorIdea} ${input.rawText}`.trim() : input.rawText.trim();

  const impact = analyzeImpact(input.rawText);
  const priorCategories = new Set(deriveRequirements(priorIdea).map((r) => r.category));
  const newCategories = new Set(deriveRequirements(combinedIdea).map((r) => r.category));
  const addedCategories = Array.from(newCategories).filter((c) => !priorCategories.has(c));

  const latestSemanticModel = await getLatestSemanticModel(actorUserId, projectId);
  const priorActorNames = new Set(
    ((latestSemanticModel?.actors as SemanticActor[] | null) ?? []).map((a) =>
      a.name.toLowerCase(),
    ),
  );
  const priorEntityNames = new Set(
    ((latestSemanticModel?.entities as SemanticEntity[] | null) ?? []).map((e) =>
      e.name.toLowerCase(),
    ),
  );
  const editExtraction = extractSemanticsHeuristically(input.rawText);
  const introducesNewSemanticContent =
    editExtraction.actors.some((a) => !priorActorNames.has(a.name.toLowerCase())) ||
    editExtraction.entities.some((e) => !priorEntityNames.has(e.name.toLowerCase()));

  return db.changeSet.create({
    data: {
      projectId,
      decisionId: input.decisionId,
      sourceText: input.rawText,
      priorIdea,
      combinedIdea,
      impactCategories: impact.categories,
      addedCategories,
      requiresRegeneration: addedCategories.length > 0 || introducesNewSemanticContent,
      status: "PENDING",
    },
  });
}

/**
 * Master Spec §27: "validate; selectively regenerate where practical;
 * test; create evidence; create a new version; update Truth Status."
 * "Selective" here means: only regenerate the Blueprint/Build Plan when
 * this edit actually introduced a category the prior Blueprint didn't
 * already cover (`requiresRegeneration`) — an edit that adds no new
 * structural signal leaves the current Blueprint/Build Plan versions
 * untouched rather than creating a no-op version. When regeneration does
 * happen, it reuses generateProductIntelligence + generateApplication
 * (P1-06/P2-06) against the combined idea text, which already perform
 * validation, testing (via their own test suites), evidence (Truth
 * Status sync), and versioning — this function does not duplicate that
 * logic, only decides whether to invoke it and records the outcome.
 */
export async function applyChangeSet(
  actorUserId: string,
  projectId: string,
  changeSetId: string,
): Promise<ChangeSet> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const changeSet = await db.changeSet.findFirst({ where: { id: changeSetId, projectId } });
  if (!changeSet || changeSet.status !== "PENDING") {
    throw new ChangeSetNotPendingError();
  }

  let resultSummary: string;
  let resultingBlueprintVersion: number | null = null;
  let resultingBuildPlanVersion: number | null = null;

  if (changeSet.requiresRegeneration) {
    await generateProductIntelligence(actorUserId, projectId, changeSet.combinedIdea);
    const generation = await generateApplication(actorUserId, projectId);
    resultingBlueprintVersion = generation.blueprint.version;
    resultingBuildPlanVersion = generation.buildPlan.version;
    resultSummary = `Regenerated Blueprint v${generation.blueprint.version} and Build Plan v${generation.buildPlan.version} (${generation.status}) to reflect: ${(changeSet.addedCategories as string[]).join(", ")}.`;
  } else {
    resultSummary = `No structural change was needed — "${changeSet.sourceText}" did not introduce a requirement category beyond what the current Blueprint already covers.`;
  }

  const updated = await db.changeSet.update({
    where: { id: changeSetId },
    data: {
      status: "APPLIED",
      resultSummary,
      resultingBlueprintVersion,
      resultingBuildPlanVersion,
      appliedAt: new Date(),
    },
  });

  await recordEvent(actorUserId, projectId, {
    type: "CHANGE_SET_APPLIED",
    summary: resultSummary,
    data: {
      changeSetId,
      requiresRegeneration: changeSet.requiresRegeneration,
      resultingBlueprintVersion,
      resultingBuildPlanVersion,
    },
  });

  return updated;
}

export async function rejectChangeSet(
  actorUserId: string,
  projectId: string,
  changeSetId: string,
): Promise<ChangeSet> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const changeSet = await db.changeSet.findFirst({ where: { id: changeSetId, projectId } });
  if (!changeSet || changeSet.status !== "PENDING") {
    throw new ChangeSetNotPendingError();
  }

  const updated = await db.changeSet.update({
    where: { id: changeSetId },
    data: { status: "REJECTED" },
  });

  await recordEvent(actorUserId, projectId, {
    type: "CHANGE_SET_REJECTED",
    summary: `Change Set rejected: "${changeSet.sourceText}" will not be applied.`,
    data: { changeSetId },
  });

  return updated;
}

export async function getChangeSetByDecisionId(
  actorUserId: string,
  projectId: string,
  decisionId: string,
): Promise<ChangeSet | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.changeSet.findFirst({ where: { decisionId, projectId } });
}

export async function listChangeSets(actorUserId: string, projectId: string): Promise<ChangeSet[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.changeSet.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}
