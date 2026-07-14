import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { requirePlatformAdmin } from "@/lib/tenancy/platform-admin";
import { setTruthStatus } from "@/lib/product/truth-status";
import { recordEvidence } from "@/lib/product/evidence";
import { sendGovernanceImpactNotificationEmail } from "@/lib/email/transactional";
import type {
  GovernanceImpactAssessment,
  GovernanceImpactMateriality,
  GovernanceInterpretationStatus,
  GovernanceRequirement,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export type RecordGovernanceRequirementInput = {
  requirementKey: string;
  domain: string;
  jurisdiction: string;
  authority: string;
  officialSource: string;
  applicability: string;
  affectedCapabilities: string[];
  effectiveDate?: Date;
  enforcementDate?: Date;
  verificationDate: Date;
  changeSummary: string;
  interpretationStatus: GovernanceInterpretationStatus;
  professionalReviewRequired: boolean;
};

/**
 * Master Spec §32's Governance Requirement Registry, §33's "continuous
 * governance monitoring". Platform-wide and append-only per
 * requirementKey — same versioning shape as
 * upsertCapabilityVersion/PlanDefinition, not project-scoped, since a
 * legal or regulatory requirement is a fact about the world, not about
 * any one customer's project. Requires real platform-admin access (P3-13,
 * src/lib/tenancy/platform-admin.ts) — recording what a real authoritative
 * source says is an internal administrative operation, not a customer
 * self-service action. No automated scraping or live source polling
 * exists or is authorized here — this build never invents which external
 * legal/regulatory sources it monitors (the same "no real, unauthorized
 * vendor/source" honesty already applied to deployment hosting (P3-08)
 * and app-store review (P3-09)); a requirement is recorded once a human
 * operator has actually verified it.
 */
export async function recordGovernanceRequirement(
  actorUserId: string,
  input: RecordGovernanceRequirementInput,
): Promise<GovernanceRequirement> {
  await requirePlatformAdmin(actorUserId);

  const previous = await db.governanceRequirement.findFirst({
    where: { requirementKey: input.requirementKey },
    orderBy: { version: "desc" },
  });

  return db.governanceRequirement.create({
    data: {
      requirementKey: input.requirementKey,
      version: (previous?.version ?? 0) + 1,
      domain: input.domain,
      jurisdiction: input.jurisdiction,
      authority: input.authority,
      officialSource: input.officialSource,
      applicability: input.applicability,
      affectedCapabilities: input.affectedCapabilities as unknown as Prisma.InputJsonValue,
      effectiveDate: input.effectiveDate,
      enforcementDate: input.enforcementDate,
      verificationDate: input.verificationDate,
      changeSummary: input.changeSummary,
      interpretationStatus: input.interpretationStatus,
      professionalReviewRequired: input.professionalReviewRequired,
      createdByUserId: actorUserId,
    },
  });
}

export async function getLatestGovernanceRequirement(
  requirementKey: string,
): Promise<GovernanceRequirement | null> {
  return db.governanceRequirement.findFirst({
    where: { requirementKey },
    orderBy: { version: "desc" },
  });
}

export class GovernanceRequirementNotFoundError extends Error {
  constructor() {
    super("No such governance requirement exists.");
    this.name = "GovernanceRequirementNotFoundError";
  }
}

export type CreateGovernanceImpactAssessmentInput = {
  governanceRequirementId: string;
  materiality: GovernanceImpactMateriality;
  remediationProposal?: string;
};

/**
 * Master Spec §33's pipeline: "requirement update → affected-project
 * mapping → remediation proposal → customer notification → approval →
 * implementation → validation → evidence." This function is the
 * "affected-project mapping" + "remediation proposal" step — requires
 * real platform-admin access (P3-13): deciding which of a customer's
 * projects a real legal requirement actually applies to, and whether
 * that application is material, is Pocket Studio's own judgment call,
 * not a customer self-service action. projectId is a lookup-scoping key,
 * not itself an authorization-check subject — this deliberately does not
 * call requireProjectAccess, since platform-admin authority is
 * cross-tenant by design (see verify-tenant-isolation.ts's reviewed
 * exception).
 */
export async function createGovernanceImpactAssessment(
  actorUserId: string,
  projectId: string,
  input: CreateGovernanceImpactAssessmentInput,
): Promise<GovernanceImpactAssessment> {
  await requirePlatformAdmin(actorUserId);

  const requirement = await db.governanceRequirement.findUnique({
    where: { id: input.governanceRequirementId },
  });
  if (!requirement) {
    throw new GovernanceRequirementNotFoundError();
  }

  return db.governanceImpactAssessment.create({
    data: {
      projectId,
      governanceRequirementId: input.governanceRequirementId,
      materiality: input.materiality,
      status: "IDENTIFIED",
      remediationProposal: input.remediationProposal,
    },
  });
}

export class GovernanceImpactAssessmentNotFoundError extends Error {
  constructor() {
    super("No such governance impact assessment exists for this project.");
    this.name = "GovernanceImpactAssessmentNotFoundError";
  }
}

export class InvalidGovernanceImpactTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move a governance impact assessment from ${from} to ${to}.`);
    this.name = "InvalidGovernanceImpactTransitionError";
  }
}

async function getOwnedAssessment(
  projectId: string,
  assessmentId: string,
): Promise<GovernanceImpactAssessment> {
  const assessment = await db.governanceImpactAssessment.findFirst({
    where: { id: assessmentId, projectId },
  });
  if (!assessment) {
    throw new GovernanceImpactAssessmentNotFoundError();
  }
  return assessment;
}

/**
 * The "customer notification" step. Requires real platform-admin access
 * (same posture as createGovernanceImpactAssessment above) — notifies the
 * project's creator by real email (P3-07 infrastructure) that a
 * governance change affects their project. A failed send never blocks
 * the workflow itself (sendGovernanceImpactNotificationEmail swallows its
 * own errors) — the transition to NOTIFIED reflects that notification was
 * attempted, which is always durably recorded as a SentEmail row
 * regardless of delivery outcome.
 */
export async function notifyCustomerOfGovernanceImpact(
  actorUserId: string,
  projectId: string,
  assessmentId: string,
): Promise<GovernanceImpactAssessment> {
  await requirePlatformAdmin(actorUserId);

  const assessment = await getOwnedAssessment(projectId, assessmentId);
  if (assessment.status !== "IDENTIFIED") {
    throw new InvalidGovernanceImpactTransitionError(assessment.status, "NOTIFIED");
  }
  const [project, requirement] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId } }),
    db.governanceRequirement.findUniqueOrThrow({
      where: { id: assessment.governanceRequirementId },
    }),
  ]);
  const owner = await db.user.findUnique({ where: { id: project.createdByUserId } });

  if (owner) {
    await sendGovernanceImpactNotificationEmail({
      userId: owner.id,
      toAddress: owner.email,
      projectName: project.name,
      changeSummary: requirement.changeSummary,
      remediationProposal: assessment.remediationProposal,
    });
  }

  return db.governanceImpactAssessment.update({
    where: { id: assessment.id },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });
}

/** The customer's own explicit approval step — genuinely customer-facing. */
export async function approveGovernanceRemediation(
  actorUserId: string,
  projectId: string,
  assessmentId: string,
): Promise<GovernanceImpactAssessment> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");
  const assessment = await getOwnedAssessment(projectId, assessmentId);
  if (assessment.status !== "NOTIFIED") {
    throw new InvalidGovernanceImpactTransitionError(assessment.status, "APPROVED");
  }
  return db.governanceImpactAssessment.update({
    where: { id: assessment.id },
    data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date() },
  });
}

/** The customer confirms the remediation itself has actually been made. */
export async function markGovernanceRemediationImplemented(
  actorUserId: string,
  projectId: string,
  assessmentId: string,
): Promise<GovernanceImpactAssessment> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");
  const assessment = await getOwnedAssessment(projectId, assessmentId);
  if (assessment.status !== "APPROVED") {
    throw new InvalidGovernanceImpactTransitionError(assessment.status, "IMPLEMENTED");
  }
  return db.governanceImpactAssessment.update({
    where: { id: assessment.id },
    data: { status: "IMPLEMENTED", implementedAt: new Date() },
  });
}

/**
 * Validation is real, evidenced work: it records a Product Evidence entry
 * and syncs Truth Status for the affected requirement, the same
 * evidence-then-status discipline used by every other real workflow this
 * phase (Quality Gate, Deployment, Store Submission).
 */
export async function validateGovernanceRemediation(
  actorUserId: string,
  projectId: string,
  assessmentId: string,
  input: { verificationMethod: string; result: string },
): Promise<GovernanceImpactAssessment> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");
  const assessment = await getOwnedAssessment(projectId, assessmentId);
  if (assessment.status !== "IMPLEMENTED") {
    throw new InvalidGovernanceImpactTransitionError(assessment.status, "VALIDATED");
  }
  const requirement = await db.governanceRequirement.findUniqueOrThrow({
    where: { id: assessment.governanceRequirementId },
  });

  await recordEvidence(actorUserId, projectId, {
    evidenceType: "STRUCTURED_MANUAL_VERIFICATION",
    subjectKey: `governance.${requirement.requirementKey}`,
    verificationMethod: input.verificationMethod,
    result: input.result,
  });
  await setTruthStatus(actorUserId, projectId, {
    subjectKey: `governance.${requirement.requirementKey}`,
    subjectLabel: `Governance requirement: ${requirement.requirementKey}`,
    status: "IMPLEMENTED",
    rationale: `Remediation for governance impact assessment ${assessment.id} validated.`,
  });

  return db.governanceImpactAssessment.update({
    where: { id: assessment.id },
    data: { status: "VALIDATED", validatedAt: new Date() },
  });
}

/**
 * Closes out a NOT_MATERIAL assessment without any customer-facing
 * workflow — requires real platform-admin access, the same posture as
 * createGovernanceImpactAssessment: judging that a real requirement does
 * not actually apply to this project is Pocket Studio's own call, not
 * something the customer needs to act on.
 */
export async function dismissGovernanceImpactAssessment(
  actorUserId: string,
  projectId: string,
  assessmentId: string,
  reason: string,
): Promise<GovernanceImpactAssessment> {
  await requirePlatformAdmin(actorUserId);

  const assessment = await getOwnedAssessment(projectId, assessmentId);
  if (assessment.status !== "IDENTIFIED") {
    throw new InvalidGovernanceImpactTransitionError(assessment.status, "DISMISSED");
  }
  return db.governanceImpactAssessment.update({
    where: { id: assessment.id },
    data: { status: "DISMISSED", dismissedReason: reason },
  });
}

export async function listGovernanceImpactAssessments(
  actorUserId: string,
  projectId: string,
): Promise<GovernanceImpactAssessment[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.governanceImpactAssessment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}
