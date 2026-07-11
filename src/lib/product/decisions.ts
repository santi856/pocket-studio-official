import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { recordEvent } from "@/lib/product/events";
import type {
  Decision,
  DecisionApprovalStatus,
  DecisionDisclosureTier,
  Prisma,
} from "@/generated/prisma/client";

export class DecisionNotPendingError extends Error {
  constructor() {
    super("This decision is not pending approval.");
    this.name = "DecisionNotPendingError";
  }
}

function defaultApprovalStatus(tier: DecisionDisclosureTier): DecisionApprovalStatus {
  switch (tier) {
    case "ROUTINE":
      return "AUTO_APPLIED";
    case "IMPORTANT":
      return "RECOMMENDED";
    case "CONSEQUENTIAL":
      return "PENDING_APPROVAL";
  }
}

export type RecordDecisionInput = {
  source: string;
  summary: string;
  disclosureTier: DecisionDisclosureTier;
  recommendation?: string;
  alternatives?: Prisma.InputJsonValue;
  reason?: string;
  impact?: Prisma.InputJsonValue;
  risk?: string;
  effectiveVersion?: string;
  evidenceRef?: string;
};

/**
 * Master Spec §15 disclosure tiers: ROUTINE applies automatically (and is
 * recorded here for the record), IMPORTANT is recommended with a default,
 * CONSEQUENTIAL requires explicit approval before it may take effect in
 * production — this function only *records* the decision at the correct
 * starting status; callers must not treat a CONSEQUENTIAL decision as
 * applied until `respondToDecision` records an APPROVED response.
 */
export async function recordDecision(
  actorUserId: string,
  projectId: string,
  input: RecordDecisionInput,
): Promise<Decision> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const decision = await db.decision.create({
    data: {
      projectId,
      source: input.source,
      summary: input.summary,
      disclosureTier: input.disclosureTier,
      approvalStatus: defaultApprovalStatus(input.disclosureTier),
      recommendation: input.recommendation,
      alternatives: input.alternatives,
      reason: input.reason,
      impact: input.impact,
      risk: input.risk,
      effectiveVersion: input.effectiveVersion,
      evidenceRef: input.evidenceRef,
      createdByUserId: actorUserId,
    },
  });

  await recordEvent(actorUserId, projectId, {
    type: "DECISION_RECORDED",
    summary: `Decision recorded (${decision.disclosureTier}): ${decision.summary}`,
    data: { decisionId: decision.id, disclosureTier: decision.disclosureTier },
  });

  return decision;
}

export async function respondToDecision(
  actorUserId: string,
  projectId: string,
  decisionId: string,
  input: { approve: boolean; customerResponse?: string },
): Promise<Decision> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const updated = await db.$transaction(async (tx) => {
    const decision = await tx.decision.findFirst({ where: { id: decisionId, projectId } });

    if (!decision || decision.approvalStatus !== "PENDING_APPROVAL") {
      throw new DecisionNotPendingError();
    }

    return tx.decision.update({
      where: { id: decisionId },
      data: {
        approvalStatus: input.approve ? "APPROVED" : "REJECTED",
        customerResponse: input.customerResponse,
        respondedAt: new Date(),
        respondedByUserId: actorUserId,
      },
    });
  });

  await recordEvent(actorUserId, projectId, {
    type: "DECISION_RESPONDED",
    summary: `Decision ${updated.approvalStatus.toLowerCase()}: ${updated.summary}`,
    data: { decisionId: updated.id, approvalStatus: updated.approvalStatus },
  });

  return updated;
}

export async function listDecisions(
  actorUserId: string,
  projectId: string,
  filter?: { approvalStatus?: DecisionApprovalStatus },
): Promise<Decision[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.decision.findMany({
    where: { projectId, approvalStatus: filter?.approvalStatus },
    orderBy: { createdAt: "desc" },
  });
}
