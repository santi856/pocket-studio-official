import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { assertPublishAllowed } from "@/lib/billing/entitlements";
import { getLatestBlueprint } from "@/lib/generation/blueprint";
import { getLatestBuildPlan } from "@/lib/generation/build-plan";
import { recordAuditLogEntry } from "@/lib/observability/audit-log";
import { recordEvent } from "@/lib/product/events";
import { generateUniquePublicSlug } from "./public-slug";
import type { ProjectPublication } from "@/generated/prisma/client";

export class NoGenerationToPublishError extends Error {
  constructor() {
    super("This project has no Blueprint and Build Plan yet — nothing to publish.");
    this.name = "NoGenerationToPublishError";
  }
}

export class NothingToUnpublishError extends Error {
  constructor() {
    super("This project has never been published.");
    this.name = "NothingToUnpublishError";
  }
}

export class NoLastKnownGoodVersionError extends Error {
  constructor() {
    super("There is no previous published version to restore.");
    this.name = "NoLastKnownGoodVersionError";
  }
}

export class PublishedVersionNoLongerExistsError extends Error {
  constructor() {
    super("The version being restored no longer exists.");
    this.name = "PublishedVersionNoLongerExistsError";
  }
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Publishing Milestone 1 (2026-07-27): pins an explicit, immutable
 * Blueprint/BuildPlan version pair as the one served at this project's
 * public URL. Both "publish the first version" and "publish an update" are
 * the same operation — the only difference is whether a ProjectPublication
 * row already exists. Never resolves "latest" at request time (that's the
 * public route's job to avoid, not this function's — see
 * src/app/p/[publicSlug]); this function's entire purpose is to freeze a
 * specific version pair so later drafts never silently change what a
 * signed-out visitor sees.
 *
 * DB-transaction-atomic and advisory-lock-serialized per projectId, same
 * pattern as src/lib/auth/login-rate-limit.ts — concurrent Publish clicks
 * from two tabs never race. Idempotent: republishing the exact version
 * pair that is already live changes nothing (no audit noise, no
 * lastKnownGood corruption).
 */
export async function publishProject(
  actorUserId: string,
  projectId: string,
): Promise<ProjectPublication> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");
  await assertPublishAllowed(actorUserId, project.organizationId);

  const [blueprint, buildPlan] = await Promise.all([
    getLatestBlueprint(actorUserId, projectId),
    getLatestBuildPlan(actorUserId, projectId),
  ]);
  if (!blueprint || !buildPlan) {
    throw new NoGenerationToPublishError();
  }

  let result: { publication: ProjectPublication; changed: boolean };
  try {
    result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;

      const existing = await tx.projectPublication.findUnique({ where: { projectId } });

      if (
        existing &&
        existing.status === "LIVE" &&
        existing.publishedBlueprintVersion === blueprint.version &&
        existing.publishedBuildPlanVersion === buildPlan.version
      ) {
        return { publication: existing, changed: false };
      }

      const publicSlug = existing?.publicSlug ?? (await generateUniquePublicSlug(project.name));

      const publication = await tx.projectPublication.upsert({
        where: { projectId },
        create: {
          projectId,
          publicSlug,
          status: "LIVE",
          publishedBlueprintVersion: blueprint.version,
          publishedBuildPlanVersion: buildPlan.version,
          publishedAt: new Date(),
          publishedByUserId: actorUserId,
        },
        update: {
          status: "LIVE",
          publishedBlueprintVersion: blueprint.version,
          publishedBuildPlanVersion: buildPlan.version,
          publishedAt: new Date(),
          publishedByUserId: actorUserId,
          // Whatever was published before this call (LIVE, SUSPENDED, or
          // UNPUBLISHED — publishedVersion fields persist regardless of
          // status) becomes the new "restore previous version" target.
          lastKnownGoodBlueprintVersion: existing?.publishedBlueprintVersion ?? null,
          lastKnownGoodBuildPlanVersion: existing?.publishedBuildPlanVersion ?? null,
          suspensionReason: null,
          failureReason: null,
        },
      });

      return { publication, changed: true };
    });
  } catch (error) {
    await db.projectPublication.updateMany({
      where: { projectId },
      data: { status: "PUBLISH_FAILED", failureReason: summarizeError(error) },
    });
    await recordAuditLogEntry({
      organizationId: project.organizationId,
      actorUserId,
      action: "PROJECT_PUBLISH_FAILED",
      targetType: "Project",
      targetId: projectId,
      metadata: { reason: summarizeError(error) },
    });
    throw error;
  }

  if (result.changed) {
    await recordAuditLogEntry({
      organizationId: project.organizationId,
      actorUserId,
      action: "PROJECT_PUBLISHED",
      targetType: "ProjectPublication",
      targetId: result.publication.id,
      metadata: {
        blueprintVersion: blueprint.version,
        buildPlanVersion: buildPlan.version,
        publicSlug: result.publication.publicSlug,
      },
    });
    await recordEvent(actorUserId, projectId, {
      type: "PROJECT_PUBLISHED",
      summary: `Published Blueprint v${blueprint.version} / Build Plan v${buildPlan.version} at /p/${result.publication.publicSlug}.`,
      data: { blueprintVersion: blueprint.version, buildPlanVersion: buildPlan.version },
    });
  }

  return result.publication;
}

/**
 * Customer-initiated takedown — distinct from SUSPENDED (billing-driven,
 * see publication-billing-sync.ts) so a billing recovery never resurrects
 * something the customer chose to remove. Idempotent: unpublishing an
 * already-unpublished project is a no-op, not an error.
 */
export async function unpublishProject(
  actorUserId: string,
  projectId: string,
): Promise<ProjectPublication> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;

    const existing = await tx.projectPublication.findUnique({ where: { projectId } });
    if (!existing) {
      throw new NothingToUnpublishError();
    }
    if (existing.status === "UNPUBLISHED") {
      return { publication: existing, changed: false };
    }

    const publication = await tx.projectPublication.update({
      where: { projectId },
      data: { status: "UNPUBLISHED", suspensionReason: null },
    });
    return { publication, changed: true };
  });

  if (result.changed) {
    await recordAuditLogEntry({
      organizationId: project.organizationId,
      actorUserId,
      action: "PROJECT_UNPUBLISHED",
      targetType: "ProjectPublication",
      targetId: result.publication.id,
      metadata: {},
    });
    await recordEvent(actorUserId, projectId, {
      type: "PROJECT_UNPUBLISHED",
      summary: "Project unpublished — its public URL no longer serves the app.",
    });
  }

  return result.publication;
}

/**
 * "Restore Previous Version" — swaps the published and last-known-good
 * version pairs, so restoring is reversible (a second restore undoes the
 * first), not a one-way trip. Re-checks assertPublishAllowed: restoring is
 * still a real publish action and must not bypass the same billing gate a
 * fresh publish would hit.
 */
export async function restoreLastKnownGoodVersion(
  actorUserId: string,
  projectId: string,
): Promise<ProjectPublication> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");
  await assertPublishAllowed(actorUserId, project.organizationId);

  const publication = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;

    const existing = await tx.projectPublication.findUnique({ where: { projectId } });
    if (
      !existing ||
      existing.lastKnownGoodBlueprintVersion === null ||
      existing.lastKnownGoodBuildPlanVersion === null
    ) {
      throw new NoLastKnownGoodVersionError();
    }

    // Defensive — nothing in this codebase deletes Blueprint/BuildPlan
    // rows today, but a restore must never point at a version that
    // somehow no longer exists rather than silently publishing garbage.
    const [targetBlueprint, targetBuildPlan] = await Promise.all([
      tx.blueprint.findUnique({
        where: {
          projectId_version: { projectId, version: existing.lastKnownGoodBlueprintVersion },
        },
      }),
      tx.buildPlan.findUnique({
        where: {
          projectId_version: { projectId, version: existing.lastKnownGoodBuildPlanVersion },
        },
      }),
    ]);
    if (!targetBlueprint || !targetBuildPlan) {
      throw new PublishedVersionNoLongerExistsError();
    }

    return tx.projectPublication.update({
      where: { projectId },
      data: {
        status: "LIVE",
        publishedBlueprintVersion: existing.lastKnownGoodBlueprintVersion,
        publishedBuildPlanVersion: existing.lastKnownGoodBuildPlanVersion,
        publishedAt: new Date(),
        publishedByUserId: actorUserId,
        lastKnownGoodBlueprintVersion: existing.publishedBlueprintVersion,
        lastKnownGoodBuildPlanVersion: existing.publishedBuildPlanVersion,
        suspensionReason: null,
        failureReason: null,
      },
    });
  });

  await recordAuditLogEntry({
    organizationId: project.organizationId,
    actorUserId,
    action: "PROJECT_PUBLICATION_ROLLED_BACK",
    targetType: "ProjectPublication",
    targetId: publication.id,
    metadata: {
      blueprintVersion: publication.publishedBlueprintVersion,
      buildPlanVersion: publication.publishedBuildPlanVersion,
    },
  });
  await recordEvent(actorUserId, projectId, {
    type: "PROJECT_PUBLICATION_ROLLED_BACK",
    summary: `Restored Blueprint v${publication.publishedBlueprintVersion} / Build Plan v${publication.publishedBuildPlanVersion}.`,
    data: {
      blueprintVersion: publication.publishedBlueprintVersion,
      buildPlanVersion: publication.publishedBuildPlanVersion,
    },
  });

  return publication;
}

export async function getPublication(
  actorUserId: string,
  projectId: string,
): Promise<ProjectPublication | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");
  return db.projectPublication.findUnique({ where: { projectId } });
}
