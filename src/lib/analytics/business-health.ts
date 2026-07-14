import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { recordEvidence } from "@/lib/product/evidence";
import { setTruthStatus } from "@/lib/product/truth-status";
import type { BillingState, StoreSubmissionPlatform } from "@/generated/prisma/client";

export type BusinessHealthSeverity = "OK" | "ATTENTION" | "CRITICAL";

export type BusinessHealthFinding = {
  name: string;
  severity: BusinessHealthSeverity;
  details: string;
  /**
   * A fixed, deterministic recommendation template — never AI-generated
   * free text. Master Spec never authorizes Pocket Studio to give real
   * financial or business advice (the same posture as §32's "not legal
   * advice" for governance output); every recommendation here is a bounded,
   * pre-written response to a specific, real, evidenced condition, not a
   * generated opinion.
   */
  recommendation: string;
};

export type BusinessHealthAssessment = {
  overallSeverity: BusinessHealthSeverity;
  findings: BusinessHealthFinding[];
};

const BILLING_CRITICAL_STATES: readonly BillingState[] = [
  "RESTRICTED",
  "SUSPENDED",
  "DELETION_SCHEDULED",
  "DELETED",
];
const BILLING_ATTENTION_STATES: readonly BillingState[] = [
  "PAST_DUE",
  "PAYMENT_RETRYING",
  "GRACE_PERIOD",
  "RETENTION_PERIOD",
];

function assessBillingState(billingState: BillingState): BusinessHealthFinding {
  if (BILLING_CRITICAL_STATES.includes(billingState)) {
    return {
      name: "Billing state",
      severity: "CRITICAL",
      details: `Billing state is ${billingState}.`,
      recommendation:
        "Resolve the outstanding payment issue as soon as possible to avoid further restriction or data loss.",
    };
  }
  if (BILLING_ATTENTION_STATES.includes(billingState)) {
    return {
      name: "Billing state",
      severity: "ATTENTION",
      details: `Billing state is ${billingState}.`,
      recommendation: "Update the payment method on file to avoid service restriction.",
    };
  }
  return {
    name: "Billing state",
    severity: "OK",
    details: `Billing state is ${billingState}.`,
    recommendation: "No action needed.",
  };
}

function overallSeverityOf(findings: BusinessHealthFinding[]): BusinessHealthSeverity {
  if (findings.some((finding) => finding.severity === "CRITICAL")) return "CRITICAL";
  if (findings.some((finding) => finding.severity === "ATTENTION")) return "ATTENTION";
  return "OK";
}

/**
 * Master Spec §61 "grounded business-health recommendations". Every
 * finding is derived from real, already-recorded facts — billing state
 * (authoritative per §37), the Quality Gate's current Truth Status,
 * recent deployment outcomes, and the latest store submission per
 * platform — never a fabricated or estimated signal, and never a
 * generated free-text opinion. Project-scoped (not organization-scoped)
 * so it can use the same real Evidence Ledger/Truth Status recording
 * every other real assessment this phase uses (Quality Gate, Store
 * Readiness, Deployment, Store Submission, Governance) — an
 * organization-wide health rollup would have no single project to record
 * evidence against, since ProductEvidence/TruthStatusEntry are both
 * project-scoped intelligence artifacts by design.
 */
export async function assessBusinessHealth(
  actorUserId: string,
  projectId: string,
): Promise<BusinessHealthAssessment> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const [subscription, qualityGate, recentDeployments, latestSubmissions] = await Promise.all([
    db.organizationSubscription.findUnique({ where: { organizationId: project.organizationId } }),
    db.truthStatusEntry.findFirst({
      where: { projectId, subjectKey: "quality.gate" },
      orderBy: { version: "desc" },
    }),
    db.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.storeSubmission.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const findings: BusinessHealthFinding[] = [
    assessBillingState(subscription?.billingState ?? "TRIALING"),
  ];

  if (qualityGate?.status === "BLOCKED") {
    findings.push({
      name: "Quality Gate",
      severity: "ATTENTION",
      details: qualityGate.rationale ?? "The Quality Gate is currently blocked.",
      recommendation: "Review the failed Quality Gate checks before deploying to production.",
    });
  }

  if (recentDeployments.length >= 3) {
    const failedCount = recentDeployments.filter(
      (deployment) => deployment.status === "FAILED",
    ).length;
    if (failedCount / recentDeployments.length >= 0.5) {
      findings.push({
        name: "Deployment reliability",
        severity: "ATTENTION",
        details: `${failedCount} of the last ${recentDeployments.length} deployments failed.`,
        recommendation:
          "Investigate recent deployment failures before attempting another production deployment.",
      });
    }
  }

  const platforms: StoreSubmissionPlatform[] = ["IOS", "ANDROID"];
  for (const platform of platforms) {
    const latest = latestSubmissions.find((submission) => submission.platform === platform);
    if (latest?.status === "REJECTED") {
      findings.push({
        name: `Store submission (${platform})`,
        severity: "ATTENTION",
        details: latest.rejectionReason ?? "The latest submission was rejected.",
        recommendation: "Address the rejection reason and submit a corrected build.",
      });
    }
  }

  const assessment: BusinessHealthAssessment = {
    overallSeverity: overallSeverityOf(findings),
    findings,
  };

  await recordEvidence(actorUserId, projectId, {
    evidenceType: "STRUCTURED_MANUAL_VERIFICATION",
    subjectKey: "business.health",
    verificationMethod: findings.map((finding) => finding.name).join("; "),
    result: `${assessment.overallSeverity} — ${
      findings
        .filter((finding) => finding.severity !== "OK")
        .map((finding) => finding.name)
        .join("; ") || "no findings requiring attention"
    }`,
    limitations:
      "Every finding and recommendation is deterministic and rule-based against real, already-recorded platform data — never AI-generated business or financial advice.",
  });
  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "business.health",
    subjectLabel: "Business health assessment",
    status: assessment.overallSeverity === "OK" ? "IMPLEMENTED" : "BLOCKED",
    rationale: `${assessment.overallSeverity}: ${findings.length} finding(s), ${
      findings.filter((finding) => finding.severity !== "OK").length
    } requiring attention.`,
  });

  return assessment;
}
