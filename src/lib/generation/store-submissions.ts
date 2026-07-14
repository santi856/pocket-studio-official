import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "./blueprint";
import { getLatestTruthStatus, setTruthStatus } from "@/lib/product/truth-status";
import { recordEvidence } from "@/lib/product/evidence";
import { upsertIntegrationRequirement } from "@/lib/product/integrations";
import { storeCredential } from "@/lib/credentials/vault";
import { listPolicyDocuments } from "@/lib/product/policy-documents";
import { getStoreReviewProvider } from "./get-store-review-provider";
import type {
  IntegrationRequirement,
  StoreSubmission,
  StoreSubmissionPlatform,
  StoreSubmissionTrack,
} from "@/generated/prisma/client";

function developerAccountCategory(platform: StoreSubmissionPlatform): string {
  return platform === "IOS" ? "apple_developer_account" : "google_play_account";
}

function developerAccountProvider(platform: StoreSubmissionPlatform): string {
  return platform === "IOS" ? "apple_app_store_connect" : "google_play_console";
}

function distributionSubjectKey(platform: StoreSubmissionPlatform): string {
  return platform === "IOS" ? "distribution.ios" : "distribution.android";
}

/**
 * Master Spec §61 "Apple/Google account connection". Reuses the existing
 * generic IntegrationRequirement/CredentialReference vault (P3-05) rather
 * than a parallel credential system -- Apple's App Store Connect API key
 * and Google's Play Console service-account JSON are each just an opaque
 * secret from this build's perspective, exactly like every other
 * customer-owned integration credential. Marked CONNECTED only *after*
 * the secret is durably stored, never before -- if storeCredential
 * throws, the requirement is left at SETUP_NEEDED, never falsely
 * CONNECTED.
 */
export async function connectDeveloperAccount(
  actorUserId: string,
  projectId: string,
  platform: StoreSubmissionPlatform,
  secret: string,
): Promise<IntegrationRequirement> {
  const category = developerAccountCategory(platform);
  const purpose =
    platform === "IOS"
      ? "Apple Developer Program account for iOS app submission (Master Spec §61)."
      : "Google Play Developer account for Android app submission (Master Spec §61).";

  const requirement = await upsertIntegrationRequirement(actorUserId, projectId, {
    category,
    purpose,
    requirementLevel: "REQUIRED",
    owner: "CUSTOMER",
    connectionStatus: "SETUP_NEEDED",
  });

  await storeCredential(actorUserId, projectId, {
    integrationRequirementId: requirement.id,
    provider: developerAccountProvider(platform),
    secret,
  });

  return upsertIntegrationRequirement(actorUserId, projectId, {
    category,
    purpose,
    requirementLevel: "REQUIRED",
    owner: "CUSTOMER",
    connectionStatus: "CONNECTED",
  });
}

export class DeveloperAccountNotConnectedError extends Error {
  constructor(platform: StoreSubmissionPlatform) {
    super(
      `No connected ${platform === "IOS" ? "Apple Developer" : "Google Play Developer"} account exists for this project yet.`,
    );
    this.name = "DeveloperAccountNotConnectedError";
  }
}

export class MobileProjectNotReadyError extends Error {
  constructor() {
    super(
      "The mobile project scaffold has not been generated and validated yet — nothing to submit.",
    );
    this.name = "MobileProjectNotReadyError";
  }
}

export class PolicyDocumentsRequiredError extends Error {
  constructor() {
    super("A Terms of Service and Privacy Policy must both be drafted before submission.");
    this.name = "PolicyDocumentsRequiredError";
  }
}

export type CreateStoreSubmissionInput = {
  platform: StoreSubmissionPlatform;
  track: StoreSubmissionTrack;
  version: string;
  buildNumber: number;
};

/**
 * Master Spec §61 "submission packages". Every real precondition is
 * checked against real project state — a connected developer account, a
 * validated mobile scaffold (P2-15/mobile.ts), and both required policy
 * documents — before a submission is created; none of these are
 * self-reported. A submission starts life IN_REVIEW: real store review
 * begins essentially immediately once submitted, so there is no
 * meaningfully distinct "submitted but not yet in review" state to model.
 */
export async function createStoreSubmission(
  actorUserId: string,
  projectId: string,
  input: CreateStoreSubmissionInput,
): Promise<StoreSubmission> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const developerAccount = await db.integrationRequirement.findFirst({
    where: { projectId, category: developerAccountCategory(input.platform) },
  });
  if (developerAccount?.connectionStatus !== "CONNECTED") {
    throw new DeveloperAccountNotConnectedError(input.platform);
  }

  const mobileSubjectKey = input.platform === "IOS" ? "output.ios" : "output.android";
  const [mobileStatus, blueprint, policies] = await Promise.all([
    getLatestTruthStatus(actorUserId, projectId, mobileSubjectKey),
    getLatestBlueprint(actorUserId, projectId),
    listPolicyDocuments(actorUserId, projectId),
  ]);
  if (mobileStatus?.status !== "IMPLEMENTED" || !blueprint) {
    throw new MobileProjectNotReadyError();
  }
  const hasTermsOfService = policies.some((doc) => doc.type === "TERMS_OF_SERVICE");
  const hasPrivacyPolicy = policies.some((doc) => doc.type === "PRIVACY_POLICY");
  if (!hasTermsOfService || !hasPrivacyPolicy) {
    throw new PolicyDocumentsRequiredError();
  }

  const submission = await db.storeSubmission.create({
    data: {
      projectId,
      platform: input.platform,
      track: input.track,
      version: input.version,
      buildNumber: input.buildNumber,
      status: "IN_REVIEW",
      basedOnBlueprintVersion: blueprint.version,
      createdByUserId: actorUserId,
    },
  });

  await recordEvidence(actorUserId, projectId, {
    evidenceType: "STORE_SUBMISSION_ATTEMPT",
    subjectKey: distributionSubjectKey(input.platform),
    verificationMethod:
      "createStoreSubmission preconditions (developer account, mobile scaffold, policy documents)",
    result: `submitted for review — version ${input.version} (${input.buildNumber}), track ${input.track}`,
    limitations:
      "No real Apple/Google submission API is implemented — this submission was recorded by Pocket Studio only, never actually transmitted to a real store.",
  });
  await setTruthStatus(actorUserId, projectId, {
    subjectKey: distributionSubjectKey(input.platform),
    subjectLabel: input.platform === "IOS" ? "App Store distribution" : "Google Play distribution",
    status: "PLANNED",
    rationale: `Submission ${submission.id} is in review.`,
  });

  return submission;
}

export class StoreSubmissionNotFoundError extends Error {
  constructor() {
    super("No such store submission exists for this project.");
    this.name = "StoreSubmissionNotFoundError";
  }
}

export class StoreSubmissionNotInReviewError extends Error {
  constructor() {
    super("This submission is not currently in review.");
    this.name = "StoreSubmissionNotInReviewError";
  }
}

async function getOwnedSubmission(
  actorUserId: string,
  projectId: string,
  submissionId: string,
): Promise<StoreSubmission> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const submission = await db.storeSubmission.findFirst({
    where: { id: submissionId, projectId },
  });
  if (!submission) {
    throw new StoreSubmissionNotFoundError();
  }
  return submission;
}

/**
 * Master Spec §61 "approval, status tracking, rejection/remediation".
 * Advances an IN_REVIEW submission to its real outcome via the review
 * provider. A rejection is a real, queryable fact (rejectionReason),
 * never silently dropped — remediation is simply a new
 * createStoreSubmission call with a corrected version/buildNumber, the
 * same append-more-attempts pattern already established for Deployment
 * (P3-08), not an edit of the rejected row.
 */
export async function advanceStoreSubmissionReview(
  actorUserId: string,
  projectId: string,
  submissionId: string,
): Promise<StoreSubmission> {
  const submission = await getOwnedSubmission(actorUserId, projectId, submissionId);
  if (submission.status !== "IN_REVIEW") {
    throw new StoreSubmissionNotInReviewError();
  }

  const provider = getStoreReviewProvider();
  const result = await provider.review({
    platform: submission.platform,
    version: submission.version,
    buildNumber: submission.buildNumber,
  });

  const updated = await db.storeSubmission.update({
    where: { id: submission.id },
    data:
      result.status === "APPROVED"
        ? { status: "APPROVED" }
        : { status: "REJECTED", rejectionReason: result.reason },
  });

  await recordEvidence(actorUserId, projectId, {
    evidenceType: "STORE_SUBMISSION_ATTEMPT",
    subjectKey: distributionSubjectKey(submission.platform),
    verificationMethod: `${provider.name} store review provider`,
    result:
      result.status === "APPROVED"
        ? `approved — submission ${submission.id}`
        : `rejected — submission ${submission.id}: ${result.reason}`,
    limitations:
      "No real Apple/Google review occurred — this outcome was produced by the mock review provider only.",
  });
  await setTruthStatus(actorUserId, projectId, {
    subjectKey: distributionSubjectKey(submission.platform),
    subjectLabel:
      submission.platform === "IOS" ? "App Store distribution" : "Google Play distribution",
    status: result.status === "APPROVED" ? "PLANNED" : "BLOCKED",
    rationale:
      result.status === "APPROVED"
        ? `Submission ${submission.id} approved; not yet released.`
        : `Submission ${submission.id} rejected: ${result.reason}`,
  });

  return updated;
}

export class StoreSubmissionNotApprovedError extends Error {
  constructor() {
    super("This submission has not been approved yet — nothing to release.");
    this.name = "StoreSubmissionNotApprovedError";
  }
}

/**
 * Master Spec §61 "releases/updates" — the explicit, customer-driven
 * "make it live" step after approval (real Apple/Google workflows commonly
 * separate approval from release, e.g. manual-release tracks).
 */
export async function releaseStoreSubmission(
  actorUserId: string,
  projectId: string,
  submissionId: string,
): Promise<StoreSubmission> {
  const submission = await getOwnedSubmission(actorUserId, projectId, submissionId);
  if (submission.status !== "APPROVED") {
    throw new StoreSubmissionNotApprovedError();
  }

  const updated = await db.storeSubmission.update({
    where: { id: submission.id },
    data: { status: "RELEASED" },
  });

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: distributionSubjectKey(submission.platform),
    subjectLabel:
      submission.platform === "IOS" ? "App Store distribution" : "Google Play distribution",
    status: "IMPLEMENTED",
    rationale: `Submission ${submission.id} released to the ${submission.track} track.`,
  });

  return updated;
}

export async function listStoreSubmissions(
  actorUserId: string,
  projectId: string,
  platform?: StoreSubmissionPlatform,
): Promise<StoreSubmission[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.storeSubmission.findMany({
    where: { projectId, platform },
    orderBy: { createdAt: "desc" },
  });
}
