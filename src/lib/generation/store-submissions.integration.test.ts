// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { createPolicyDocumentDraft } from "@/lib/product/policy-documents";
import { generateMobileProject } from "./mobile";
import {
  DeveloperAccountNotConnectedError,
  MobileProjectNotReadyError,
  PolicyDocumentsRequiredError,
  StoreSubmissionNotApprovedError,
  StoreSubmissionNotFoundError,
  StoreSubmissionNotInReviewError,
  advanceStoreSubmissionReview,
  connectDeveloperAccount,
  createStoreSubmission,
  listStoreSubmissions,
  releaseStoreSubmission,
} from "./store-submissions";

describe("store-submissions", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProject() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    await db.blueprint.create({
      data: {
        projectId: project.id,
        version: 1,
        schemaVersion: "1.0",
        validationStatus: "VALID",
        screens: ["Home", "Booking"],
        createdByUserId: owner.id,
      },
    });
    return { owner, project };
  }

  async function seedReadySubmission(platform: "IOS" | "ANDROID" = "IOS", buildNumber = 1) {
    const { owner, project } = await seedProject();
    await generateMobileProject(owner.id, project.id);
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "TERMS_OF_SERVICE",
      content: "Terms.",
    });
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "Privacy.",
    });
    await connectDeveloperAccount(owner.id, project.id, platform, "sk_test_apple_or_google");
    const submission = await createStoreSubmission(owner.id, project.id, {
      platform,
      track: "INTERNAL_TESTING",
      version: "1.0.0",
      buildNumber,
    });
    return { owner, project, submission };
  }

  describe("connectDeveloperAccount", () => {
    it("stores the credential and marks the requirement CONNECTED", async () => {
      const { owner, project } = await seedProject();

      const requirement = await connectDeveloperAccount(
        owner.id,
        project.id,
        "IOS",
        "sk_test_apple",
      );

      expect(requirement.connectionStatus).toBe("CONNECTED");
      expect(requirement.category).toBe("apple_developer_account");

      const credential = await db.credentialReference.findUnique({
        where: { integrationRequirementId: requirement.id },
      });
      expect(credential).not.toBeNull();
      expect(credential?.ciphertext).not.toContain("sk_test_apple");
    });

    it("tracks iOS and Android accounts independently", async () => {
      const { owner, project } = await seedProject();

      await connectDeveloperAccount(owner.id, project.id, "IOS", "sk_test_apple");
      const androidReq = await connectDeveloperAccount(
        owner.id,
        project.id,
        "ANDROID",
        "sk_test_google",
      );

      expect(androidReq.category).toBe("google_play_account");
      const requirements = await db.integrationRequirement.findMany({
        where: { projectId: project.id },
      });
      expect(requirements).toHaveLength(2);
    });
  });

  describe("createStoreSubmission", () => {
    it("throws DeveloperAccountNotConnectedError when no developer account is connected", async () => {
      const { owner, project } = await seedProject();
      await generateMobileProject(owner.id, project.id);

      await expect(
        createStoreSubmission(owner.id, project.id, {
          platform: "IOS",
          track: "INTERNAL_TESTING",
          version: "1.0.0",
          buildNumber: 1,
        }),
      ).rejects.toBeInstanceOf(DeveloperAccountNotConnectedError);
    });

    it("throws MobileProjectNotReadyError when the mobile scaffold has not been generated", async () => {
      const { owner, project } = await seedProject();
      await connectDeveloperAccount(owner.id, project.id, "IOS", "sk_test_apple");

      await expect(
        createStoreSubmission(owner.id, project.id, {
          platform: "IOS",
          track: "INTERNAL_TESTING",
          version: "1.0.0",
          buildNumber: 1,
        }),
      ).rejects.toBeInstanceOf(MobileProjectNotReadyError);
    });

    it("throws PolicyDocumentsRequiredError when Terms of Service or Privacy Policy is missing", async () => {
      const { owner, project } = await seedProject();
      await generateMobileProject(owner.id, project.id);
      await connectDeveloperAccount(owner.id, project.id, "IOS", "sk_test_apple");

      await expect(
        createStoreSubmission(owner.id, project.id, {
          platform: "IOS",
          track: "INTERNAL_TESTING",
          version: "1.0.0",
          buildNumber: 1,
        }),
      ).rejects.toBeInstanceOf(PolicyDocumentsRequiredError);
    });

    it("creates a submission IN_REVIEW once every real precondition is met", async () => {
      const { owner, project, submission } = await seedReadySubmission();

      expect(submission.status).toBe("IN_REVIEW");
      expect(submission.platform).toBe("IOS");
      expect(submission.basedOnBlueprintVersion).toBe(1);

      const all = await listStoreSubmissions(owner.id, project.id);
      expect(all).toHaveLength(1);
    });

    it("denies access to a non-member", async () => {
      const { project } = await seedReadySubmission();
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });

      await expect(
        createStoreSubmission(outsider.id, project.id, {
          platform: "IOS",
          track: "INTERNAL_TESTING",
          version: "1.0.1",
          buildNumber: 2,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("advanceStoreSubmissionReview", () => {
    it("approves a submission with a valid build number", async () => {
      const { owner, project, submission } = await seedReadySubmission();

      const updated = await advanceStoreSubmissionReview(owner.id, project.id, submission.id);

      expect(updated.status).toBe("APPROVED");
    });

    it("rejects a submission with an invalid build number and records the reason", async () => {
      const { owner, project, submission } = await seedReadySubmission("IOS", 0);

      const updated = await advanceStoreSubmissionReview(owner.id, project.id, submission.id);

      expect(updated.status).toBe("REJECTED");
      expect(updated.rejectionReason).toBeTruthy();
    });

    it("throws StoreSubmissionNotInReviewError when called twice", async () => {
      const { owner, project, submission } = await seedReadySubmission();
      await advanceStoreSubmissionReview(owner.id, project.id, submission.id);

      await expect(
        advanceStoreSubmissionReview(owner.id, project.id, submission.id),
      ).rejects.toBeInstanceOf(StoreSubmissionNotInReviewError);
    });

    it("throws StoreSubmissionNotFoundError for an unknown submission id", async () => {
      const { owner, project } = await seedReadySubmission();

      await expect(
        advanceStoreSubmissionReview(owner.id, project.id, "nonexistent-id"),
      ).rejects.toBeInstanceOf(StoreSubmissionNotFoundError);
    });
  });

  describe("releaseStoreSubmission", () => {
    it("releases an approved submission", async () => {
      const { owner, project, submission } = await seedReadySubmission();
      await advanceStoreSubmissionReview(owner.id, project.id, submission.id);

      const released = await releaseStoreSubmission(owner.id, project.id, submission.id);

      expect(released.status).toBe("RELEASED");
    });

    it("throws StoreSubmissionNotApprovedError for a submission still in review", async () => {
      const { owner, project, submission } = await seedReadySubmission();

      await expect(
        releaseStoreSubmission(owner.id, project.id, submission.id),
      ).rejects.toBeInstanceOf(StoreSubmissionNotApprovedError);
    });

    it("throws StoreSubmissionNotApprovedError for a rejected submission", async () => {
      const { owner, project, submission } = await seedReadySubmission("IOS", 0);
      await advanceStoreSubmissionReview(owner.id, project.id, submission.id);

      await expect(
        releaseStoreSubmission(owner.id, project.id, submission.id),
      ).rejects.toBeInstanceOf(StoreSubmissionNotApprovedError);
    });
  });

  describe("rejection/remediation", () => {
    it("allows a new submission with a corrected build after a rejection, preserving history", async () => {
      const { owner, project, submission } = await seedReadySubmission("IOS", 0);
      await advanceStoreSubmissionReview(owner.id, project.id, submission.id);

      const resubmitted = await createStoreSubmission(owner.id, project.id, {
        platform: "IOS",
        track: "INTERNAL_TESTING",
        version: "1.0.1",
        buildNumber: 2,
      });

      expect(resubmitted.status).toBe("IN_REVIEW");
      const all = await listStoreSubmissions(owner.id, project.id, "IOS");
      expect(all).toHaveLength(2);
      const rejected = all.find((s) => s.id === submission.id);
      expect(rejected?.status).toBe("REJECTED");
    });
  });
});
