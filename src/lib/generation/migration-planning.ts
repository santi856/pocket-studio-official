import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getBlueprintVersion } from "./blueprint";
import { recordDecision } from "@/lib/product/decisions";
import type { Decision } from "@/generated/prisma/client";

/**
 * Master Spec §28: "Database changes require: schema diff; data-loss
 * analysis; compatibility analysis; migration plan; backup requirement;
 * Preview migration; validation; approval for destructive changes;
 * rollback plan. AI may not silently perform destructive production
 * changes." Applies here to a generated product's own data models
 * (Blueprint `dataModels`, P2-04's `GeneratedRecord` store) — not to this
 * platform's own Postgres schema, which is migrated through Prisma the
 * ordinary way.
 *
 * A Blueprint version change never literally alters `GeneratedRecord` rows
 * (no destructive database operation runs automatically) — what it changes
 * is which fields future generation and validation (`createGeneratedRecord`,
 * P2-04) will recognize for a data model. This module's "data loss" is
 * accordingly precise: a field a customer's product stops declaring, that
 * existing records still hold real, non-null values for, becomes
 * inaccessible through the new schema going forward — the data is not
 * deleted from storage, but the product stops reading or writing it. That
 * distinction is stated honestly in every plan this module produces.
 */

export class BlueprintVersionNotFoundForMigrationError extends Error {
  constructor(version: number) {
    super(`Blueprint version ${version} does not exist for this project.`);
    this.name = "BlueprintVersionNotFoundForMigrationError";
  }
}

type BlueprintDataModel = { name: string; fields: string[] };

function asDataModels(value: unknown): BlueprintDataModel[] {
  return Array.isArray(value)
    ? (value as BlueprintDataModel[]).filter(
        (item) => typeof item?.name === "string" && Array.isArray(item?.fields),
      )
    : [];
}

export type DataModelDiff = {
  modelName: string;
  status: "added" | "removed" | "changed" | "unchanged";
  fieldsAdded: string[];
  fieldsRemoved: string[];
};

/** The schema-diff step: which data models and fields changed between two Blueprint versions. */
export function diffDataModels(
  from: BlueprintDataModel[],
  to: BlueprintDataModel[],
): DataModelDiff[] {
  const fromByName = new Map(from.map((model) => [model.name, model]));
  const toByName = new Map(to.map((model) => [model.name, model]));
  const allNames = new Set([...fromByName.keys(), ...toByName.keys()]);

  const diffs: DataModelDiff[] = [];
  for (const name of allNames) {
    const fromModel = fromByName.get(name);
    const toModel = toByName.get(name);

    if (!fromModel) {
      diffs.push({
        modelName: name,
        status: "added",
        fieldsAdded: toModel!.fields,
        fieldsRemoved: [],
      });
      continue;
    }
    if (!toModel) {
      diffs.push({
        modelName: name,
        status: "removed",
        fieldsAdded: [],
        fieldsRemoved: fromModel.fields,
      });
      continue;
    }

    const fieldsAdded = toModel.fields.filter((field) => !fromModel.fields.includes(field));
    const fieldsRemoved = fromModel.fields.filter((field) => !toModel.fields.includes(field));
    diffs.push({
      modelName: name,
      status: fieldsAdded.length > 0 || fieldsRemoved.length > 0 ? "changed" : "unchanged",
      fieldsAdded,
      fieldsRemoved,
    });
  }

  return diffs;
}

export type DataModelMigrationPlan = {
  fromVersion: number;
  toVersion: number;
  diffs: DataModelDiff[];
  dataLossRisks: string[];
  compatibilityNotes: string[];
  destructive: boolean;
  backupRequirement: string;
  rollbackPlan: string;
  steps: string[];
};

/**
 * The full §28 planning sequence: schema diff, then a real data-loss
 * analysis (queries actual `GeneratedRecord` rows for each removed field,
 * not just a structural guess), compatibility notes for added fields,
 * an ordered migration plan, and an honest backup/rollback statement —
 * this is a preview only; it never mutates any `GeneratedRecord` row.
 */
export async function planDataModelMigration(
  actorUserId: string,
  projectId: string,
  fromVersion: number,
  toVersion: number,
): Promise<DataModelMigrationPlan> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [fromBlueprint, toBlueprint] = await Promise.all([
    getBlueprintVersion(actorUserId, projectId, fromVersion),
    getBlueprintVersion(actorUserId, projectId, toVersion),
  ]);
  if (!fromBlueprint) throw new BlueprintVersionNotFoundForMigrationError(fromVersion);
  if (!toBlueprint) throw new BlueprintVersionNotFoundForMigrationError(toVersion);

  const diffs = diffDataModels(
    asDataModels(fromBlueprint.dataModels),
    asDataModels(toBlueprint.dataModels),
  );

  const dataLossRisks: string[] = [];
  const compatibilityNotes: string[] = [];
  const steps: string[] = [];

  for (const diff of diffs) {
    if (diff.status === "removed") {
      const count = await db.generatedRecord.count({
        where: { projectId, modelKey: diff.modelName },
      });
      if (count > 0) {
        dataLossRisks.push(
          `Data model "${diff.modelName}" would no longer be declared; ${count} existing record(s) still hold this data (not deleted, but no longer read or written).`,
        );
      }
      steps.push(
        `Confirm no active workflow still depends on "${diff.modelName}" before removing it.`,
      );
      continue;
    }
    if (diff.status === "added") {
      steps.push(`Add data model "${diff.modelName}" with fields: ${diff.fieldsAdded.join(", ")}.`);
      continue;
    }
    if (diff.status !== "changed") continue;

    for (const field of diff.fieldsRemoved) {
      const records = await db.generatedRecord.findMany({
        where: { projectId, modelKey: diff.modelName },
        select: { data: true },
      });
      const withData = records.filter((record) => {
        const data = record.data as Record<string, unknown> | null;
        return (
          data && typeof data === "object" && data[field] !== undefined && data[field] !== null
        );
      });
      if (withData.length > 0) {
        dataLossRisks.push(
          `"${diff.modelName}.${field}" would no longer be declared; ${withData.length} of ${records.length} existing record(s) have real data in this field (not deleted, but no longer read or written).`,
        );
      }
      steps.push(
        `Remove "${field}" from "${diff.modelName}" only after confirming the data-loss risk above is acceptable.`,
      );
    }
    for (const field of diff.fieldsAdded) {
      compatibilityNotes.push(
        `"${diff.modelName}.${field}" is new; existing records do not have it and must supply it the next time they are updated (createGeneratedRecord/updateGeneratedRecord require every declared field).`,
      );
      steps.push(
        `Add "${field}" to "${diff.modelName}"; existing records will need it backfilled before their next update.`,
      );
    }
  }

  const destructive = dataLossRisks.length > 0;

  return {
    fromVersion,
    toVersion,
    diffs,
    dataLossRisks,
    compatibilityNotes,
    destructive,
    backupRequirement: destructive
      ? "REQUIRED before proceeding — no automated backup mechanism exists yet for generated-app data (a known Phase 2 limitation); export the affected records manually first."
      : "Not required — no data-loss risk detected.",
    rollbackPlan: `Blueprint versions are append-only (never overwritten); restoring to v${fromVersion} (P2-09's restoreBlueprintVersion) reverts the declared data model shape. Any records already migrated to the new field shape are not automatically reverted.`,
    steps,
  };
}

/**
 * Records the plan as a Decision — CONSEQUENTIAL when destructive (Master
 * Spec §28's "approval for destructive changes"), ROUTINE otherwise — so a
 * destructive migration surfaces through the same disclosure/approval
 * mechanism (§15) every other consequential change already uses, rather
 * than a new one-off gate.
 */
export async function recordMigrationPlanDecision(
  actorUserId: string,
  projectId: string,
  plan: DataModelMigrationPlan,
): Promise<Decision> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return recordDecision(actorUserId, projectId, {
    source: "orchestration.migration-planning",
    summary: `Data model migration plan from Blueprint v${plan.fromVersion} to v${plan.toVersion} (${plan.destructive ? "destructive" : "non-destructive"}).`,
    disclosureTier: plan.destructive ? "CONSEQUENTIAL" : "ROUTINE",
    reason: plan.destructive
      ? `Data-loss risk identified: ${plan.dataLossRisks.join("; ")}`
      : "No data-loss risk identified from the current schema diff.",
    impact: {
      diffs: plan.diffs,
      dataLossRisks: plan.dataLossRisks,
      compatibilityNotes: plan.compatibilityNotes,
    },
  });
}
