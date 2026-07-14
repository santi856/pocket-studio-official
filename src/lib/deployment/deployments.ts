import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "@/lib/generation/blueprint";
import { getLatestBuildPlan } from "@/lib/generation/build-plan";
import { getLatestTruthStatus, setTruthStatus } from "@/lib/product/truth-status";
import { recordEvidence } from "@/lib/product/evidence";
import { getDeploymentProvider } from "./get-deployment-provider";
import type { Deployment, DeploymentEnvironment } from "@/generated/prisma/client";

export class NoGenerationToDeployError extends Error {
  constructor() {
    super("This project has no Blueprint and Build Plan yet — nothing to deploy.");
    this.name = "NoGenerationToDeployError";
  }
}

export class ProductionDeploymentBlockedError extends Error {
  constructor() {
    super(
      "The Quality Gate has not passed for this project's current generation — production deployment is blocked until it does.",
    );
    this.name = "ProductionDeploymentBlockedError";
  }
}

export class NoPreviousDeploymentToRollBackToError extends Error {
  constructor(environment: DeploymentEnvironment) {
    super(`There is no earlier successful deployment to ${environment} to roll back to.`);
    this.name = "NoPreviousDeploymentToRollBackToError";
  }
}

function truthStatusSubjectKey(environment: DeploymentEnvironment): string {
  return `deployment.${environment.toLowerCase()}`;
}

/**
 * Master Spec §61: "supported deployment; deployment evidence and
 * rollback". Every attempt — succeeded or failed — is recorded as a real,
 * queryable Deployment row (same "every attempt is a real fact" pattern
 * as LoginAttempt/ProcessedWebhookEvent/SentEmail), and mirrored into the
 * Evidence Ledger and Truth Status so a deployment's real state is
 * inspectable the same way Quality Gate results are. Production
 * deployments additionally require the Quality Gate to currently pass —
 * lower-stakes environments do not, since iterating in
 * development/preview/staging is exactly when the gate is still expected
 * to fail.
 */
export async function createDeployment(
  actorUserId: string,
  projectId: string,
  environment: DeploymentEnvironment,
): Promise<Deployment> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [blueprint, buildPlan] = await Promise.all([
    getLatestBlueprint(actorUserId, projectId),
    getLatestBuildPlan(actorUserId, projectId),
  ]);
  if (!blueprint || !buildPlan) {
    throw new NoGenerationToDeployError();
  }

  if (environment === "PRODUCTION") {
    const qualityGate = await getLatestTruthStatus(actorUserId, projectId, "quality.gate");
    if (qualityGate?.status !== "IMPLEMENTED") {
      throw new ProductionDeploymentBlockedError();
    }
  }

  const provider = getDeploymentProvider();
  const result = await provider.deploy({
    environment,
    projectSlug: project.slug,
    blueprintVersion: blueprint.version,
    buildPlanVersion: buildPlan.version,
  });

  const deployment = await db.deployment.create({
    data: {
      projectId,
      environment,
      status: result.status,
      blueprintVersion: blueprint.version,
      buildPlanVersion: buildPlan.version,
      provider: provider.name,
      providerDeploymentId: result.status === "SUCCEEDED" ? result.providerDeploymentId : null,
      failureReason: result.status === "FAILED" ? result.failureReason : null,
      createdByUserId: actorUserId,
    },
  });

  const subjectKey = truthStatusSubjectKey(environment);
  await recordEvidence(actorUserId, projectId, {
    evidenceType: "DEPLOYMENT_ATTEMPT",
    subjectKey,
    verificationMethod: `${provider.name} deployment provider`,
    result:
      result.status === "SUCCEEDED"
        ? `succeeded — Blueprint v${blueprint.version}, Build Plan v${buildPlan.version}, provider id ${result.providerDeploymentId}`
        : `failed — ${result.failureReason}`,
    limitations:
      "No real hosting provider is implemented — this deployment was performed by the mock provider, never pushed to a live host.",
  });
  await setTruthStatus(actorUserId, projectId, {
    subjectKey,
    subjectLabel: `Deployment to ${environment}`,
    status: result.status === "SUCCEEDED" ? "IMPLEMENTED" : "BLOCKED",
    rationale:
      result.status === "SUCCEEDED"
        ? `Deployment ${deployment.id} succeeded.`
        : `Deployment ${deployment.id} failed: ${result.failureReason}`,
  });

  return deployment;
}

/**
 * The active deployment for an environment is simply the newest row whose
 * status is SUCCEEDED — no separate "isActive" pointer to keep in sync.
 * Rolling back marks the current one ROLLED_BACK, which makes this query
 * naturally fall through to the next-newest SUCCEEDED row.
 */
export async function getActiveDeployment(
  actorUserId: string,
  projectId: string,
  environment: DeploymentEnvironment,
): Promise<Deployment | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.deployment.findFirst({
    where: { projectId, environment, status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
  });
}

export async function listDeployments(
  actorUserId: string,
  projectId: string,
  environment?: DeploymentEnvironment,
): Promise<Deployment[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.deployment.findMany({
    where: { projectId, environment },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Rolls back the current active deployment for an environment by marking
 * it ROLLED_BACK and returning the previous SUCCEEDED deployment, which
 * becomes active again by construction (see getActiveDeployment). This
 * never re-runs the provider — rollback is a Pocket-Studio-side record
 * transition, not a new deploy attempt.
 */
export async function rollbackDeployment(
  actorUserId: string,
  projectId: string,
  environment: DeploymentEnvironment,
): Promise<Deployment> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.$transaction(async (tx) => {
    const current = await tx.deployment.findFirst({
      where: { projectId, environment, status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
    });
    if (!current) {
      throw new NoPreviousDeploymentToRollBackToError(environment);
    }

    const previous = await tx.deployment.findFirst({
      where: {
        projectId,
        environment,
        status: "SUCCEEDED",
        createdAt: { lt: current.createdAt },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!previous) {
      throw new NoPreviousDeploymentToRollBackToError(environment);
    }

    await tx.deployment.update({
      where: { id: current.id },
      data: { status: "ROLLED_BACK" },
    });

    return previous;
  });
}
