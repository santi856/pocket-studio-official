import "server-only";
import { getLatestBuildPlan } from "./build-plan";
import { listGeneratedRecords, createGeneratedRecord } from "./generated-records";
import type { ScreenDataState } from "./screen-data-binding";
import type { GeneratedRecord, Prisma } from "@/generated/prisma/client";

export class NoBuildPlanError extends Error {
  constructor() {
    super("This project has no Build Plan yet — generate one first.");
    this.name = "NoBuildPlanError";
  }
}

export class ScreenHasNoDataDependencyError extends Error {
  constructor(screenName: string) {
    super(`Screen "${screenName}" has no data dependency in the current Build Plan.`);
    this.name = "ScreenHasNoDataDependencyError";
  }
}

function screenModelKey(dataDependencies: unknown, screenName: string): string | undefined {
  const deps = (dataDependencies as Record<string, string[]> | null)?.[screenName];
  return deps?.[0];
}

/**
 * The Interactive Runtime half of P2-05: loads the real `GeneratedRecord`
 * rows (P2-04) a screen depends on, per the project's latest Build Plan
 * `dataDependencies` (P2-03). Returns a `ScreenDataState` for
 * `bindScreenData` (screen-data-binding.ts) to apply to the screen's
 * component tree — never silently treated as "success" when there is no
 * configured data dependency.
 */
export async function loadScreenData(
  actorUserId: string,
  projectId: string,
  screenName: string,
): Promise<ScreenDataState> {
  const plan = await getLatestBuildPlan(actorUserId, projectId);
  if (!plan) {
    throw new NoBuildPlanError();
  }

  const modelKey = screenModelKey(plan.dataDependencies, screenName);
  if (!modelKey) {
    return {
      status: "error",
      message: `Screen "${screenName}" has no data dependency in the current Build Plan.`,
    };
  }

  const records = await listGeneratedRecords(actorUserId, projectId, { modelKey });
  return records.length === 0
    ? { status: "empty", modelKey }
    : { status: "success", modelKey, records };
}

/**
 * The write side of the same binding: a Form submission on a screen
 * creates a real `GeneratedRecord` for the data model that screen depends
 * on, validated against the current Blueprint by `createGeneratedRecord`
 * (P2-04) — the same source of truth `loadScreenData` reads from.
 */
export async function submitScreenRecord(
  actorUserId: string,
  projectId: string,
  screenName: string,
  data: Prisma.InputJsonValue & Record<string, unknown>,
  ownerGeneratedAppUserId?: string,
): Promise<GeneratedRecord> {
  const plan = await getLatestBuildPlan(actorUserId, projectId);
  if (!plan) {
    throw new NoBuildPlanError();
  }

  const modelKey = screenModelKey(plan.dataDependencies, screenName);
  if (!modelKey) {
    throw new ScreenHasNoDataDependencyError(screenName);
  }

  return createGeneratedRecord(actorUserId, projectId, { modelKey, data, ownerGeneratedAppUserId });
}
