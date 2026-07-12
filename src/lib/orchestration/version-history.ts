import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { listProductStateVersions } from "@/lib/product/product-state";
import {
  createBlueprintVersion,
  getBlueprintVersion,
  getLatestBlueprint,
  listBlueprintVersions,
} from "@/lib/generation/blueprint";
import { listBuildPlanVersions } from "@/lib/generation/build-plan";
import { listChangeSets } from "./change-set";
import { validateBlueprint } from "@/lib/generation/blueprint-validation";
import { recordEvent } from "@/lib/product/events";
import type { Blueprint, Prisma } from "@/generated/prisma/client";
import type { BlueprintValidationResult } from "@/lib/generation/blueprint-validation";

/**
 * Master Spec §27: "Version history includes: immutable version
 * identifiers; Product State; Blueprint; Build Plan; generated artifacts;
 * Change Set; evidence; restore preview; restore validation." Every
 * underlying table (ProductState, Blueprint, BuildPlan, ChangeSet) is
 * already append-only versioned — no row is ever mutated or deleted, which
 * is what makes every entry here an "immutable version identifier" by
 * construction. This module adds the missing piece: a single, chronological
 * view across all of them, plus restore preview/validation/execution for
 * Blueprint (the artifact a customer would most meaningfully want to roll
 * back — see D-0030 for why BuildPlan/ProductState restore follow the
 * identical pattern but are not implemented here).
 */

export type ProjectVersionEntryKind = "PRODUCT_STATE" | "BLUEPRINT" | "BUILD_PLAN" | "CHANGE_SET";

export type ProjectVersionEntry = {
  kind: ProjectVersionEntryKind;
  id: string;
  version: number | null;
  createdAt: Date;
  summary: string;
};

export async function getProjectVersionHistory(
  actorUserId: string,
  projectId: string,
): Promise<ProjectVersionEntry[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [productStates, blueprints, buildPlans, changeSets] = await Promise.all([
    listProductStateVersions(actorUserId, projectId),
    listBlueprintVersions(actorUserId, projectId),
    listBuildPlanVersions(actorUserId, projectId),
    listChangeSets(actorUserId, projectId),
  ]);

  const entries: ProjectVersionEntry[] = [
    ...productStates.map((state) => ({
      kind: "PRODUCT_STATE" as const,
      id: state.id,
      version: state.version,
      createdAt: state.createdAt,
      summary: `Product State v${state.version}: ${state.originalIdea.slice(0, 80)}`,
    })),
    ...blueprints.map((blueprint) => ({
      kind: "BLUEPRINT" as const,
      id: blueprint.id,
      version: blueprint.version,
      createdAt: blueprint.createdAt,
      summary: `Blueprint v${blueprint.version} (${blueprint.validationStatus})`,
    })),
    ...buildPlans.map((plan) => ({
      kind: "BUILD_PLAN" as const,
      id: plan.id,
      version: plan.version,
      createdAt: plan.createdAt,
      summary: `Build Plan v${plan.version} (${plan.planStatus}), based on Blueprint v${plan.basedOnBlueprintVersion}`,
    })),
    ...changeSets.map((changeSet) => ({
      kind: "CHANGE_SET" as const,
      id: changeSet.id,
      version: null,
      createdAt: changeSet.createdAt,
      summary: `Change Set: "${changeSet.sourceText}" (${changeSet.status})`,
    })),
  ];

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export class BlueprintVersionNotFoundError extends Error {
  constructor(version: number) {
    super(`Blueprint version ${version} does not exist for this project.`);
    this.name = "BlueprintVersionNotFoundError";
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asDataModelNames(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as Array<{ name?: unknown }>)
        .map((item) => item?.name)
        .filter((name): name is string => typeof name === "string")
    : [];
}

export type BlueprintRestoreDiff = {
  targetVersion: number;
  currentVersion: number;
  screensAdded: string[];
  screensRemoved: string[];
  dataModelsAdded: string[];
  dataModelsRemoved: string[];
};

/**
 * "Restore preview" (§27): shows what reverting to `targetVersion` would
 * change relative to the current latest Blueprint, without applying
 * anything — a real, computed diff, not a description.
 */
export async function previewBlueprintRestore(
  actorUserId: string,
  projectId: string,
  targetVersion: number,
): Promise<BlueprintRestoreDiff> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [target, current] = await Promise.all([
    getBlueprintVersion(actorUserId, projectId, targetVersion),
    getLatestBlueprint(actorUserId, projectId),
  ]);
  if (!target) {
    throw new BlueprintVersionNotFoundError(targetVersion);
  }
  // `current` cannot be null here: `target` is itself a Blueprint row for
  // this project, so at least one version — and therefore a latest one —
  // is guaranteed to exist.
  const currentBlueprint = current!;

  const targetScreens = new Set(asStringArray(target.screens));
  const currentScreens = new Set(asStringArray(currentBlueprint.screens));
  const targetDataModels = new Set(asDataModelNames(target.dataModels));
  const currentDataModels = new Set(asDataModelNames(currentBlueprint.dataModels));

  return {
    targetVersion,
    currentVersion: currentBlueprint.version,
    screensAdded: [...targetScreens].filter((s) => !currentScreens.has(s)),
    screensRemoved: [...currentScreens].filter((s) => !targetScreens.has(s)),
    dataModelsAdded: [...targetDataModels].filter((m) => !currentDataModels.has(m)),
    dataModelsRemoved: [...currentDataModels].filter((m) => !targetDataModels.has(m)),
  };
}

/**
 * "Restore validation" (§27): re-runs the same structural validation every
 * newly generated Blueprint passes through (blueprint-validation.ts)
 * against the target version's stored content, so a restore is never
 * applied blindly — confirming the target is still valid, not just that it
 * once was.
 */
export async function validateBlueprintRestore(
  actorUserId: string,
  projectId: string,
  targetVersion: number,
): Promise<BlueprintValidationResult> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const target = await getBlueprintVersion(actorUserId, projectId, targetVersion);
  if (!target) {
    throw new BlueprintVersionNotFoundError(targetVersion);
  }

  return validateBlueprint({
    schemaVersion: target.schemaVersion,
    productType: target.productType,
    roles: asStringArray(target.roles),
    screens: asStringArray(target.screens),
    outputTargets: asStringArray(target.outputTargets),
    dataModels: Array.isArray(target.dataModels)
      ? (target.dataModels as Array<{ name: string; fields: string[] }>)
      : [],
    requirements: Array.isArray(target.requirements) ? target.requirements : [],
  });
}

function toInputJson(value: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined {
  return value === null ? undefined : (value as Prisma.InputJsonValue);
}

/**
 * Performs the restore: creates a new, top Blueprint version whose content
 * equals `targetVersion`'s, rather than mutating or deleting anything in
 * between — the same append-only discipline used everywhere else in this
 * codebase. A Build Plan is not automatically regenerated; that remains a
 * separate, explicit action (P2-03's generateBuildPlan against whatever is
 * now the latest Blueprint).
 */
export async function restoreBlueprintVersion(
  actorUserId: string,
  projectId: string,
  targetVersion: number,
): Promise<Blueprint> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const target = await getBlueprintVersion(actorUserId, projectId, targetVersion);
  if (!target) {
    throw new BlueprintVersionNotFoundError(targetVersion);
  }

  const priorMetadata = (target.generationMetadata as Record<string, unknown> | null) ?? {};

  const restored = await createBlueprintVersion(actorUserId, projectId, {
    schemaVersion: target.schemaVersion,
    productType: target.productType,
    targetUsers: toInputJson(target.targetUsers),
    roles: toInputJson(target.roles),
    requirements: toInputJson(target.requirements),
    workflows: toInputJson(target.workflows),
    screens: toInputJson(target.screens),
    navigation: toInputJson(target.navigation),
    dataModels: toInputJson(target.dataModels),
    permissions: toInputJson(target.permissions),
    actions: toInputJson(target.actions),
    integrations: toInputJson(target.integrations),
    businessRules: toInputJson(target.businessRules),
    monetization: toInputJson(target.monetization),
    subscriptions: toInputJson(target.subscriptions),
    ownerOperations: toInputJson(target.ownerOperations),
    outputTargets: toInputJson(target.outputTargets),
    themeAndStyle: toInputJson(target.themeAndStyle),
    interactionContracts: toInputJson(target.interactionContracts),
    assumptions: toInputJson(target.assumptions),
    openDecisions: toInputJson(target.openDecisions),
    memory: toInputJson(target.memory),
    security: toInputJson(target.security),
    privacy: toInputJson(target.privacy),
    accessibility: toInputJson(target.accessibility),
    governance: toInputJson(target.governance),
    feasibility: toInputJson(target.feasibility),
    generationMetadata: {
      ...priorMetadata,
      restoredFromVersion: targetVersion,
      restoredAt: new Date().toISOString(),
    },
    validationStatus: target.validationStatus,
    validationErrors: toInputJson(target.validationErrors),
    basedOnProductStateVersion: target.basedOnProductStateVersion,
    basedOnProductDnaVersion: target.basedOnProductDnaVersion,
  });

  await recordEvent(actorUserId, projectId, {
    type: "BLUEPRINT_RESTORED",
    summary: `Restored Blueprint v${targetVersion}'s content as new v${restored.version}.`,
    data: { restoredFromVersion: targetVersion, newVersion: restored.version },
  });

  return restored;
}
