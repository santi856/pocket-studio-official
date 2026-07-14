import "server-only";
import { db } from "@/lib/db";
import { createNextVersion } from "@/lib/db-versioning";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import type {
  PolicyAcceptance,
  PolicyDocument,
  PolicyDocumentType,
} from "@/generated/prisma/client";

export type CreatePolicyDocumentDraftInput = {
  type: PolicyDocumentType;
  content: string;
  language?: string;
  basedOnProductStateVersion?: number;
  /** Only meaningful when `language` is not "en" — see listOutdatedTranslations. */
  translatedFromVersion?: number;
};

/**
 * Versioned per (projectId, type, language) — Master Spec §34/§35. Always
 * creates a DRAFT; publication requires customer approval and, where
 * appropriate, professional review (§34), neither of which this function
 * performs — it only persists the draft.
 */
export async function createPolicyDocumentDraft(
  actorUserId: string,
  projectId: string,
  input: CreatePolicyDocumentDraftInput,
): Promise<PolicyDocument> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const language = input.language ?? "en";

  return createNextVersion(() =>
    db.$transaction(async (tx) => {
      const previous = await tx.policyDocument.findFirst({
        where: { projectId, type: input.type, language },
        orderBy: { version: "desc" },
      });

      return tx.policyDocument.create({
        data: {
          projectId,
          type: input.type,
          language,
          version: (previous?.version ?? 0) + 1,
          status: "DRAFT",
          content: input.content,
          basedOnProductStateVersion: input.basedOnProductStateVersion,
          translatedFromVersion: input.translatedFromVersion,
          createdByUserId: actorUserId,
        },
      });
    }),
  );
}

export async function getLatestPolicyDocument(
  actorUserId: string,
  projectId: string,
  type: PolicyDocumentType,
  language = "en",
): Promise<PolicyDocument | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.policyDocument.findFirst({
    where: { projectId, type, language },
    orderBy: { version: "desc" },
  });
}

export async function listPolicyDocuments(
  actorUserId: string,
  projectId: string,
): Promise<PolicyDocument[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.policyDocument.findMany({
    where: { projectId },
    orderBy: [{ type: "asc" }, { language: "asc" }, { version: "desc" }],
  });
}

export class PolicyDocumentNotFoundError extends Error {
  constructor() {
    super("No such policy document exists for this project.");
    this.name = "PolicyDocumentNotFoundError";
  }
}

export class InvalidPolicyDocumentTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move a policy document from ${from} to ${to}.`);
    this.name = "InvalidPolicyDocumentTransitionError";
  }
}

async function getOwnedPolicyDocument(
  actorUserId: string,
  projectId: string,
  policyDocumentId: string,
): Promise<PolicyDocument> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const doc = await db.policyDocument.findFirst({ where: { id: policyDocumentId, projectId } });
  if (!doc) {
    throw new PolicyDocumentNotFoundError();
  }
  return doc;
}

/**
 * Master Spec §61 "professional-review workflow" and "policy publication
 * ... tracking". DRAFT -> PENDING_REVIEW -> APPROVED -> PUBLISHED, using
 * exactly the four states the schema has anticipated since Phase 1
 * (PolicyDocumentStatus). Publication requires the customer's own
 * explicit approval (§34) — approvePolicyDocument records who approved
 * and when, never inferred.
 */
export async function submitPolicyDocumentForReview(
  actorUserId: string,
  projectId: string,
  policyDocumentId: string,
): Promise<PolicyDocument> {
  const doc = await getOwnedPolicyDocument(actorUserId, projectId, policyDocumentId);
  if (doc.status !== "DRAFT") {
    throw new InvalidPolicyDocumentTransitionError(doc.status, "PENDING_REVIEW");
  }
  return db.policyDocument.update({ where: { id: doc.id }, data: { status: "PENDING_REVIEW" } });
}

/**
 * A real, recorded attestation that a qualified reviewer looked at this
 * draft — Pocket Studio never performs the review itself (§32's "not
 * legal advice" boundary). Metadata, not a status transition: it can be
 * recorded whenever real review actually happens, independent of where
 * the document currently sits in the publication pipeline.
 */
export async function recordPolicyDocumentProfessionalReview(
  actorUserId: string,
  projectId: string,
  policyDocumentId: string,
  input: { reviewerName: string },
): Promise<PolicyDocument> {
  const doc = await getOwnedPolicyDocument(actorUserId, projectId, policyDocumentId);
  return db.policyDocument.update({
    where: { id: doc.id },
    data: {
      professionallyReviewed: true,
      reviewerName: input.reviewerName,
      reviewedAt: new Date(),
    },
  });
}

export async function approvePolicyDocument(
  actorUserId: string,
  projectId: string,
  policyDocumentId: string,
): Promise<PolicyDocument> {
  const doc = await getOwnedPolicyDocument(actorUserId, projectId, policyDocumentId);
  if (doc.status !== "PENDING_REVIEW") {
    throw new InvalidPolicyDocumentTransitionError(doc.status, "APPROVED");
  }
  return db.policyDocument.update({
    where: { id: doc.id },
    data: { status: "APPROVED", approvedByUserId: actorUserId, approvedAt: new Date() },
  });
}

export async function publishPolicyDocument(
  actorUserId: string,
  projectId: string,
  policyDocumentId: string,
): Promise<PolicyDocument> {
  const doc = await getOwnedPolicyDocument(actorUserId, projectId, policyDocumentId);
  if (doc.status !== "APPROVED") {
    throw new InvalidPolicyDocumentTransitionError(doc.status, "PUBLISHED");
  }
  return db.policyDocument.update({
    where: { id: doc.id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
}

export class PolicyDocumentNotPublishedError extends Error {
  constructor() {
    super("A generated-app user can only accept a PUBLISHED policy document.");
    this.name = "PolicyDocumentNotPublishedError";
  }
}

export class GeneratedAppUserNotFoundForAcceptanceError extends Error {
  constructor() {
    super("No such generated-app user exists for this project.");
    this.name = "GeneratedAppUserNotFoundForAcceptanceError";
  }
}

/**
 * Master Spec §61 "policy publication and acceptance tracking". Records a
 * generated product's own end user accepting a specific PUBLISHED
 * PolicyDocument version — deliberately has no actorUserId, the same
 * no-actor exception already established for createGeneratedAppCharge
 * (P3-06) and authenticateGeneratedAppUser (P3-02): a generated app's own
 * end user accepting its terms has no Pocket Studio member "acting".
 * projectId is a lookup-scoping key here, not an authorization subject —
 * today's access boundary is the caller's own generated-app session, not
 * this function (same disclosed limitation as authenticateGeneratedAppUser:
 * not yet wired into any live route). Idempotent per (document, user):
 * accepting the same version twice is a no-op, not a duplicate row.
 */
export async function recordPolicyAcceptance(
  projectId: string,
  input: { policyDocumentId: string; generatedAppUserId: string },
): Promise<PolicyAcceptance> {
  const doc = await db.policyDocument.findFirst({
    where: { id: input.policyDocumentId, projectId },
  });
  if (!doc) {
    throw new PolicyDocumentNotFoundError();
  }
  if (doc.status !== "PUBLISHED") {
    throw new PolicyDocumentNotPublishedError();
  }
  const generatedAppUser = await db.generatedAppUser.findFirst({
    where: { id: input.generatedAppUserId, projectId },
  });
  if (!generatedAppUser) {
    throw new GeneratedAppUserNotFoundForAcceptanceError();
  }

  return db.policyAcceptance.upsert({
    where: {
      policyDocumentId_generatedAppUserId: {
        policyDocumentId: input.policyDocumentId,
        generatedAppUserId: input.generatedAppUserId,
      },
    },
    create: {
      projectId,
      policyDocumentId: input.policyDocumentId,
      generatedAppUserId: input.generatedAppUserId,
    },
    update: {},
  });
}

/**
 * Master Spec §35 "detect outdated translations when the source document
 * changes". Compares every non-English PolicyDocument against the
 * current latest English version of the same type: a translation is
 * stale when it was translated from an English version older than the
 * one that exists now, or when it records no `translatedFromVersion` at
 * all (an untracked translation can never be proven current).
 */
export type OutdatedTranslation = {
  document: PolicyDocument;
  currentEnglishVersion: number;
};

export async function listOutdatedTranslations(
  actorUserId: string,
  projectId: string,
): Promise<OutdatedTranslation[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const documents = await db.policyDocument.findMany({
    where: { projectId },
    orderBy: [{ type: "asc" }, { language: "asc" }, { version: "desc" }],
  });

  const latestEnglishByType = new Map<PolicyDocumentType, number>();
  for (const doc of documents) {
    if (doc.language !== "en") continue;
    const current = latestEnglishByType.get(doc.type);
    if (current === undefined || doc.version > current) {
      latestEnglishByType.set(doc.type, doc.version);
    }
  }

  const latestNonEnglishByTypeAndLanguage = new Map<string, PolicyDocument>();
  for (const doc of documents) {
    if (doc.language === "en") continue;
    const key = `${doc.type}:${doc.language}`;
    const current = latestNonEnglishByTypeAndLanguage.get(key);
    if (!current || doc.version > current.version) {
      latestNonEnglishByTypeAndLanguage.set(key, doc);
    }
  }

  const outdated: OutdatedTranslation[] = [];
  for (const doc of latestNonEnglishByTypeAndLanguage.values()) {
    const currentEnglishVersion = latestEnglishByType.get(doc.type);
    if (currentEnglishVersion === undefined) continue;
    if (doc.translatedFromVersion === null || doc.translatedFromVersion < currentEnglishVersion) {
      outdated.push({ document: doc, currentEnglishVersion });
    }
  }

  return outdated;
}
