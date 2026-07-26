import "server-only";
import { db } from "@/lib/db";
import { requireGeneratedAppSessionForProject } from "./generated-app-session";
import { screenModelKey, NoBuildPlanError, ScreenHasNoDataDependencyError } from "./render-runtime";
import { asDataModels, validateRecordFields, UnknownDataModelError } from "./generated-records";
import type { ScreenDataState } from "./screen-data-binding";
import type {
  BuildPlan,
  GeneratedAppUser,
  GeneratedRecord,
  Prisma,
} from "@/generated/prisma/client";

/**
 * The generated-app-end-user counterpart to getLatestBuildPlan/loadScreenData
 * (render-runtime.ts) and createGeneratedRecord/listGeneratedRecords
 * (generated-records.ts). Those functions authorize via
 * requireProjectAccess against a Pocket Studio platform actorUserId — the
 * wrong check entirely for a generated product's own real customer, who
 * has no Pocket Studio account or org membership. Every function here
 * instead authorizes via requireGeneratedAppSessionForProject
 * (generated-app-session.ts), the Generated-App-User identity domain's own
 * authz root, and scopes every record read/write to the authenticated
 * GeneratedAppUser's own ownerGeneratedAppUserId — a customer of a
 * generated booking app sees their own bookings, not every customer's.
 *
 * Blueprint/BuildPlan rows themselves are fetched directly (no
 * platform-membership check): they define the product's own screen and
 * data-model shape, which a real customer of that product already
 * necessarily sees reflected in the screens this same session renders —
 * there is no separate confidentiality boundary to enforce for reading
 * that structure, only for the record *data* the shape describes.
 */

async function getLatestBuildPlanForProject(projectId: string): Promise<BuildPlan | null> {
  return db.buildPlan.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
}

export async function loadScreenDataForAppUser(
  sessionToken: string,
  projectId: string,
  screenName: string,
): Promise<{ generatedAppUser: GeneratedAppUser; screenData: ScreenDataState }> {
  const generatedAppUser = await requireGeneratedAppSessionForProject(sessionToken, projectId);

  const buildPlan = await getLatestBuildPlanForProject(projectId);
  if (!buildPlan) {
    throw new NoBuildPlanError();
  }

  const modelKey = screenModelKey(buildPlan.dataDependencies, screenName);
  if (!modelKey) {
    return {
      generatedAppUser,
      screenData: {
        status: "error",
        message: `Screen "${screenName}" has no data dependency in the current Build Plan.`,
      },
    };
  }

  const records = await db.generatedRecord.findMany({
    where: { projectId, modelKey, ownerGeneratedAppUserId: generatedAppUser.id },
    orderBy: { createdAt: "asc" },
  });

  return {
    generatedAppUser,
    screenData:
      records.length === 0
        ? { status: "empty", modelKey }
        : { status: "success", modelKey, records },
  };
}

export async function submitScreenRecordForAppUser(
  sessionToken: string,
  projectId: string,
  screenName: string,
  data: Prisma.InputJsonValue & Record<string, unknown>,
): Promise<GeneratedRecord> {
  const generatedAppUser = await requireGeneratedAppSessionForProject(sessionToken, projectId);

  const buildPlan = await getLatestBuildPlanForProject(projectId);
  if (!buildPlan) {
    throw new NoBuildPlanError();
  }

  const modelKey = screenModelKey(buildPlan.dataDependencies, screenName);
  if (!modelKey) {
    throw new ScreenHasNoDataDependencyError(screenName);
  }

  const blueprint = await db.blueprint.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const dataModel = asDataModels(blueprint?.dataModels).find((model) => model.name === modelKey);
  if (!dataModel) {
    throw new UnknownDataModelError(modelKey);
  }
  validateRecordFields(dataModel, data);

  return db.generatedRecord.create({
    data: { projectId, modelKey, data, ownerGeneratedAppUserId: generatedAppUser.id },
  });
}
