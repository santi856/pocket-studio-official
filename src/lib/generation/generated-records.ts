import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "./blueprint";
import type { GeneratedRecord, Prisma } from "@/generated/prisma/client";

export class UnknownDataModelError extends Error {
  constructor(modelKey: string) {
    super(
      `"${modelKey}" is not a data model defined on this project's current Blueprint. Generate or update the Blueprint first.`,
    );
    this.name = "UnknownDataModelError";
  }
}

export class InvalidRecordDataError extends Error {
  constructor(modelKey: string, missingFields: string[]) {
    super(
      `Record for data model "${modelKey}" is missing required field(s): ${missingFields.join(", ")}.`,
    );
    this.name = "InvalidRecordDataError";
  }
}

export class GeneratedRecordNotFoundError extends Error {
  constructor() {
    super("Record not found for this project.");
    this.name = "GeneratedRecordNotFoundError";
  }
}

export type BlueprintDataModel = { name: string; fields: string[] };

export function asDataModels(value: unknown): BlueprintDataModel[] {
  return Array.isArray(value)
    ? (value as BlueprintDataModel[]).filter(
        (item) => typeof item?.name === "string" && Array.isArray(item?.fields),
      )
    : [];
}

async function requireDataModel(
  actorUserId: string,
  projectId: string,
  modelKey: string,
): Promise<BlueprintDataModel> {
  const blueprint = await getLatestBlueprint(actorUserId, projectId);
  const dataModels = asDataModels(blueprint?.dataModels);
  const dataModel = dataModels.find((model) => model.name === modelKey);
  if (!dataModel) {
    throw new UnknownDataModelError(modelKey);
  }
  return dataModel;
}

export function validateRecordFields(
  dataModel: BlueprintDataModel,
  data: Record<string, unknown>,
): void {
  const missingFields = dataModel.fields.filter((field) => !(field in data));
  if (missingFields.length > 0) {
    throw new InvalidRecordDataError(dataModel.name, missingFields);
  }
}

export type CreateGeneratedRecordInput = {
  modelKey: string;
  data: Prisma.InputJsonValue & Record<string, unknown>;
  ownerGeneratedAppUserId?: string;
};

/**
 * Generic per-project record store (Master Spec §25) keyed by a Blueprint
 * data model's name, rather than a dynamically generated Postgres table per
 * customer — see D-0025. `modelKey` and required fields are validated
 * against the project's current Blueprint at write time, so a record can
 * never silently reference a data model the Blueprint doesn't define.
 */
export async function createGeneratedRecord(
  actorUserId: string,
  projectId: string,
  input: CreateGeneratedRecordInput,
): Promise<GeneratedRecord> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const dataModel = await requireDataModel(actorUserId, projectId, input.modelKey);
  validateRecordFields(dataModel, input.data);

  return db.generatedRecord.create({
    data: {
      projectId,
      modelKey: input.modelKey,
      data: input.data,
      ownerGeneratedAppUserId: input.ownerGeneratedAppUserId,
    },
  });
}

export async function listGeneratedRecords(
  actorUserId: string,
  projectId: string,
  filter?: { modelKey?: string; ownerGeneratedAppUserId?: string },
): Promise<GeneratedRecord[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.generatedRecord.findMany({
    where: {
      projectId,
      modelKey: filter?.modelKey,
      ownerGeneratedAppUserId: filter?.ownerGeneratedAppUserId,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getGeneratedRecord(
  actorUserId: string,
  projectId: string,
  recordId: string,
): Promise<GeneratedRecord | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.generatedRecord.findFirst({
    where: { id: recordId, projectId },
  });
}

export async function updateGeneratedRecord(
  actorUserId: string,
  projectId: string,
  recordId: string,
  data: Prisma.InputJsonValue & Record<string, unknown>,
): Promise<GeneratedRecord> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const existing = await db.generatedRecord.findFirst({ where: { id: recordId, projectId } });
  if (!existing) {
    throw new GeneratedRecordNotFoundError();
  }

  const dataModel = await requireDataModel(actorUserId, projectId, existing.modelKey);
  validateRecordFields(dataModel, data);

  return db.generatedRecord.update({
    where: { id: recordId },
    data: { data },
  });
}

export async function deleteGeneratedRecord(
  actorUserId: string,
  projectId: string,
  recordId: string,
): Promise<void> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  await db.generatedRecord.deleteMany({ where: { id: recordId, projectId } });
}
