// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  GeneratedAppUserNotFoundForAcceptanceError,
  InvalidPolicyDocumentTransitionError,
  PolicyDocumentNotFoundError,
  PolicyDocumentNotPublishedError,
  approvePolicyDocument,
  createPolicyDocumentDraft,
  getLatestPolicyDocument,
  listOutdatedTranslations,
  listPolicyDocuments,
  publishPolicyDocument,
  recordPolicyAcceptance,
  recordPolicyDocumentProfessionalReview,
  submitPolicyDocumentForReview,
} from "./policy-documents";

describe("Policy Documents", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    return { owner, outsider, project };
  }

  it("creates version 1 as a DRAFT", async () => {
    const { owner, project } = await seedProject();

    const doc = await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "Draft privacy policy content.",
    });

    expect(doc.version).toBe(1);
    expect(doc.status).toBe("DRAFT");
    expect(doc.language).toBe("en");
  });

  it("increments the version for the same type and language", async () => {
    const { owner, project } = await seedProject();

    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "v1",
    });
    const v2 = await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "v2",
    });

    expect(v2.version).toBe(2);
    const latest = await getLatestPolicyDocument(owner.id, project.id, "PRIVACY_POLICY");
    expect(latest?.content).toBe("v2");
  });

  it("versions independently per language", async () => {
    const { owner, project } = await seedProject();

    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "English v1",
      language: "en",
    });
    const spanishV1 = await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "Spanish v1",
      language: "es",
    });

    expect(spanishV1.version).toBe(1);
  });

  it("versions independently per document type", async () => {
    const { owner, project } = await seedProject();

    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "privacy",
    });
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "TERMS_OF_SERVICE",
      content: "terms",
    });

    const all = await listPolicyDocuments(owner.id, project.id);
    expect(all).toHaveLength(2);
  });

  it("denies policy document access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "x",
    });

    await expect(listPolicyDocuments(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  describe("publication workflow (submit -> review -> approve -> publish)", () => {
    it("moves DRAFT -> PENDING_REVIEW -> APPROVED -> PUBLISHED", async () => {
      const { owner, project } = await seedProject();
      const draft = await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "v1",
      });

      const submitted = await submitPolicyDocumentForReview(owner.id, project.id, draft.id);
      expect(submitted.status).toBe("PENDING_REVIEW");

      const reviewed = await recordPolicyDocumentProfessionalReview(
        owner.id,
        project.id,
        draft.id,
        {
          reviewerName: "Jane Attorney",
        },
      );
      expect(reviewed.professionallyReviewed).toBe(true);
      expect(reviewed.reviewerName).toBe("Jane Attorney");
      expect(reviewed.reviewedAt).not.toBeNull();

      const approved = await approvePolicyDocument(owner.id, project.id, draft.id);
      expect(approved.status).toBe("APPROVED");
      expect(approved.approvedByUserId).toBe(owner.id);

      const published = await publishPolicyDocument(owner.id, project.id, draft.id);
      expect(published.status).toBe("PUBLISHED");
      expect(published.publishedAt).not.toBeNull();
    });

    it("rejects out-of-order transitions", async () => {
      const { owner, project } = await seedProject();
      const draft = await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "v1",
      });

      await expect(approvePolicyDocument(owner.id, project.id, draft.id)).rejects.toBeInstanceOf(
        InvalidPolicyDocumentTransitionError,
      );
      await expect(publishPolicyDocument(owner.id, project.id, draft.id)).rejects.toBeInstanceOf(
        InvalidPolicyDocumentTransitionError,
      );
    });

    it("throws PolicyDocumentNotFoundError for an unknown id", async () => {
      const { owner, project } = await seedProject();

      await expect(
        submitPolicyDocumentForReview(owner.id, project.id, "nonexistent-id"),
      ).rejects.toBeInstanceOf(PolicyDocumentNotFoundError);
    });

    it("denies the workflow to a non-member", async () => {
      const { owner, outsider, project } = await seedProject();
      const draft = await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "v1",
      });

      await expect(
        submitPolicyDocumentForReview(outsider.id, project.id, draft.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("recordPolicyAcceptance (generated-app end user)", () => {
    async function seedPublishedPolicy(projectId: string, ownerId: string) {
      const draft = await createPolicyDocumentDraft(ownerId, projectId, {
        type: "TERMS_OF_SERVICE",
        content: "Terms v1",
      });
      await submitPolicyDocumentForReview(ownerId, projectId, draft.id);
      await approvePolicyDocument(ownerId, projectId, draft.id);
      return publishPolicyDocument(ownerId, projectId, draft.id);
    }

    it("records an acceptance for a published document", async () => {
      const { owner, project } = await seedProject();
      const published = await seedPublishedPolicy(project.id, owner.id);
      const endUser = await db.generatedAppUser.create({
        data: {
          projectId: project.id,
          email: "customer@example.com",
          passwordHash: "irrelevant",
          role: "customer",
        },
      });

      const acceptance = await recordPolicyAcceptance(project.id, {
        policyDocumentId: published.id,
        generatedAppUserId: endUser.id,
      });

      expect(acceptance.policyDocumentId).toBe(published.id);
      expect(acceptance.generatedAppUserId).toBe(endUser.id);
    });

    it("is idempotent for the same document and user", async () => {
      const { owner, project } = await seedProject();
      const published = await seedPublishedPolicy(project.id, owner.id);
      const endUser = await db.generatedAppUser.create({
        data: {
          projectId: project.id,
          email: "customer@example.com",
          passwordHash: "irrelevant",
          role: "customer",
        },
      });

      await recordPolicyAcceptance(project.id, {
        policyDocumentId: published.id,
        generatedAppUserId: endUser.id,
      });
      await recordPolicyAcceptance(project.id, {
        policyDocumentId: published.id,
        generatedAppUserId: endUser.id,
      });

      const count = await db.policyAcceptance.count({ where: { policyDocumentId: published.id } });
      expect(count).toBe(1);
    });

    it("throws PolicyDocumentNotPublishedError for a draft document", async () => {
      const { owner, project } = await seedProject();
      const draft = await createPolicyDocumentDraft(owner.id, project.id, {
        type: "TERMS_OF_SERVICE",
        content: "Terms v1",
      });
      const endUser = await db.generatedAppUser.create({
        data: {
          projectId: project.id,
          email: "customer@example.com",
          passwordHash: "irrelevant",
          role: "customer",
        },
      });

      await expect(
        recordPolicyAcceptance(project.id, {
          policyDocumentId: draft.id,
          generatedAppUserId: endUser.id,
        }),
      ).rejects.toBeInstanceOf(PolicyDocumentNotPublishedError);
    });

    it("throws GeneratedAppUserNotFoundForAcceptanceError for an unknown end user", async () => {
      const { owner, project } = await seedProject();
      const published = await seedPublishedPolicy(project.id, owner.id);

      await expect(
        recordPolicyAcceptance(project.id, {
          policyDocumentId: published.id,
          generatedAppUserId: "nonexistent-id",
        }),
      ).rejects.toBeInstanceOf(GeneratedAppUserNotFoundForAcceptanceError);
    });
  });

  describe("listOutdatedTranslations", () => {
    it("flags a translation with no translatedFromVersion as outdated", async () => {
      const { owner, project } = await seedProject();
      await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "English v1",
        language: "en",
      });
      await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "Spanish, untracked",
        language: "es",
      });

      const outdated = await listOutdatedTranslations(owner.id, project.id);

      expect(outdated).toHaveLength(1);
      expect(outdated[0]?.document.language).toBe("es");
      expect(outdated[0]?.currentEnglishVersion).toBe(1);
    });

    it("does not flag a translation that matches the current English version", async () => {
      const { owner, project } = await seedProject();
      await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "English v1",
        language: "en",
      });
      await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "Spanish v1",
        language: "es",
        translatedFromVersion: 1,
      });

      const outdated = await listOutdatedTranslations(owner.id, project.id);

      expect(outdated).toHaveLength(0);
    });

    it("flags a translation as outdated once the English source is revised", async () => {
      const { owner, project } = await seedProject();
      await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "English v1",
        language: "en",
      });
      await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "Spanish v1",
        language: "es",
        translatedFromVersion: 1,
      });
      await createPolicyDocumentDraft(owner.id, project.id, {
        type: "PRIVACY_POLICY",
        content: "English v2, materially changed",
        language: "en",
      });

      const outdated = await listOutdatedTranslations(owner.id, project.id);

      expect(outdated).toHaveLength(1);
      expect(outdated[0]?.currentEnglishVersion).toBe(2);
    });
  });
});
