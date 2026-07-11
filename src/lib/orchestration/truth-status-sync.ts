import "server-only";
import { recordEvidence } from "@/lib/product/evidence";
import { setTruthStatus } from "@/lib/product/truth-status";
import type { FeasibilityReport } from "@/lib/orchestration/feasibility";
import type { CapabilityImplementationLevel, TruthStatusValue } from "@/generated/prisma/client";

/**
 * A capability being SUPPORTED_NOW on the *platform* registry does not
 * mean it is IMPLEMENTED for *this project* — Phase 1 generates nothing
 * yet (that's Phase 2). This mapping is deliberately conservative: only a
 * capability the platform can act on immediately maps to something better
 * than PLANNED, and even that only reflects readiness, not that anything
 * has actually been built for this specific project (Master Spec §4.4:
 * never infer implementation from design).
 */
const IMPLEMENTATION_LEVEL_TO_TRUTH_STATUS: Record<
  CapabilityImplementationLevel,
  TruthStatusValue
> = {
  SUPPORTED_NOW: "IMPLEMENTED",
  SUPPORTED_WITH_CONFIGURATION: "PLANNED",
  SUPPORTED_WITH_CUSTOMER_INTEGRATION: "PLANNED",
  SUPPORTED_LATER_PHASE: "PLANNED",
  PROTOTYPE_ONLY: "PLANNED",
  PLANNING_ONLY: "PLANNED",
  EXTERNAL_APPROVAL_REQUIRED: "BLOCKED",
  PROFESSIONAL_REVIEW_REQUIRED: "BLOCKED",
  NOT_CURRENTLY_SUPPORTED: "UNSUPPORTED",
  UNSAFE_OR_PROHIBITED: "UNSUPPORTED",
  INSUFFICIENT_INFORMATION: "NOT_EVALUATED",
};

/**
 * Turns a Feasibility Report into recorded Evidence and Truth Status for
 * the project — the step that makes Master Spec §53's "truthful statuses
 * for implemented, planned, missing, blocked, unsupported, and not
 * evaluated capabilities" a queryable fact rather than an implicit claim.
 */
export async function syncTruthStatusFromFeasibility(
  actorUserId: string,
  projectId: string,
  report: FeasibilityReport,
): Promise<void> {
  for (const assessment of report.assessments) {
    const evidence = await recordEvidence(actorUserId, projectId, {
      evidenceType: "FEASIBILITY_ASSESSMENT",
      subjectKey: assessment.capabilityKey,
      verificationMethod: "Supported Capability Registry lookup",
      result: assessment.implementationLevel,
      limitations: assessment.limitations.join("; ") || undefined,
    });

    await setTruthStatus(actorUserId, projectId, {
      subjectKey: assessment.capabilityKey,
      subjectLabel: assessment.label,
      status: IMPLEMENTATION_LEVEL_TO_TRUTH_STATUS[assessment.implementationLevel],
      evidenceRef: evidence.id,
      rationale: assessment.limitations.join("; ") || undefined,
    });
  }

  for (const unrecognizedKey of report.unrecognizedCapabilityKeys) {
    const evidence = await recordEvidence(actorUserId, projectId, {
      evidenceType: "FEASIBILITY_ASSESSMENT",
      subjectKey: unrecognizedKey,
      verificationMethod: "Supported Capability Registry lookup",
      result: "no registry entry found",
    });

    await setTruthStatus(actorUserId, projectId, {
      subjectKey: unrecognizedKey,
      subjectLabel: unrecognizedKey,
      status: "NOT_EVALUATED",
      evidenceRef: evidence.id,
      rationale: "No Supported Capability Registry entry exists for this capability yet.",
    });
  }
}
