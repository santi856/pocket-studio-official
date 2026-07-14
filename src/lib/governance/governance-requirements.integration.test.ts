// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { grantPlatformAdmin } from "@/lib/tenancy/platform-admin";
import { getLatestTruthStatus } from "@/lib/product/truth-status";
import { listEvidence } from "@/lib/product/evidence";
import {
  GovernanceImpactAssessmentNotFoundError,
  GovernanceRequirementNotFoundError,
  InvalidGovernanceImpactTransitionError,
  approveGovernanceRemediation,
  createGovernanceImpactAssessment,
  dismissGovernanceImpactAssessment,
  getLatestGovernanceRequirement,
  listGovernanceImpactAssessments,
  markGovernanceRemediationImplemented,
  notifyCustomerOfGovernanceImpact,
  recordGovernanceRequirement,
  validateGovernanceRemediation,
} from "./governance-requirements";

describe("governance requirements and impact assessments", () => {
  beforeEach(async () => {
    await resetDatabase();
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
    return { owner, project };
  }

  async function seedAdmin() {
    const admin = await registerUser({ email: "admin@example.com", password: "password123" });
    await grantPlatformAdmin(admin.id, admin.id);
    return admin;
  }

  const REQUIREMENT_INPUT = {
    requirementKey: "ca-ccpa-2026-update",
    domain: "privacy",
    jurisdiction: "California, USA",
    authority: "California Privacy Protection Agency",
    officialSource: "https://cppa.ca.gov/regulations",
    applicability: "Businesses collecting personal information from California residents.",
    affectedCapabilities: ["governance.legal_document_drafts"],
    verificationDate: new Date("2026-07-01"),
    changeSummary: "Updated disclosure requirements for automated decision-making.",
    interpretationStatus: "VERIFIED_MATERIAL" as const,
    professionalReviewRequired: true,
  };

  describe("recordGovernanceRequirement", () => {
    it("creates version 1 for a new requirementKey", async () => {
      const admin = await seedAdmin();

      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);

      expect(requirement.version).toBe(1);
      expect(requirement.requirementKey).toBe("ca-ccpa-2026-update");
    });

    it("increments the version for the same requirementKey, preserving history", async () => {
      const admin = await seedAdmin();
      await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);
      const v2 = await recordGovernanceRequirement(admin.id, {
        ...REQUIREMENT_INPUT,
        changeSummary: "Further clarification issued.",
      });

      expect(v2.version).toBe(2);
      const latest = await getLatestGovernanceRequirement("ca-ccpa-2026-update");
      expect(latest?.version).toBe(2);
      expect(latest?.changeSummary).toContain("clarification");

      const history = await db.governanceRequirement.findMany({
        where: { requirementKey: "ca-ccpa-2026-update" },
      });
      expect(history).toHaveLength(2);
    });

    it("denies a non-admin", async () => {
      const { owner } = await seedProject();

      await expect(recordGovernanceRequirement(owner.id, REQUIREMENT_INPUT)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("createGovernanceImpactAssessment", () => {
    it("throws GovernanceRequirementNotFoundError for an unknown requirement", async () => {
      const admin = await seedAdmin();
      const { project } = await seedProject();

      await expect(
        createGovernanceImpactAssessment(admin.id, project.id, {
          governanceRequirementId: "nonexistent-id",
          materiality: "MATERIAL",
        }),
      ).rejects.toBeInstanceOf(GovernanceRequirementNotFoundError);
    });

    it("creates an IDENTIFIED assessment for a real requirement", async () => {
      const admin = await seedAdmin();
      const { project } = await seedProject();
      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);

      const assessment = await createGovernanceImpactAssessment(admin.id, project.id, {
        governanceRequirementId: requirement.id,
        materiality: "MATERIAL",
        remediationProposal: "Update the Privacy Policy's automated-decision-making section.",
      });

      expect(assessment.status).toBe("IDENTIFIED");
      expect(assessment.materiality).toBe("MATERIAL");
    });

    it("denies a non-admin, even a MEMBER of the affected project", async () => {
      const admin = await seedAdmin();
      const { owner, project } = await seedProject();
      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);

      await expect(
        createGovernanceImpactAssessment(owner.id, project.id, {
          governanceRequirementId: requirement.id,
          materiality: "MATERIAL",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("full remediation pipeline", () => {
    async function seedAssessment() {
      const admin = await seedAdmin();
      const { owner, project } = await seedProject();
      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);
      const assessment = await createGovernanceImpactAssessment(admin.id, project.id, {
        governanceRequirementId: requirement.id,
        materiality: "MATERIAL",
        remediationProposal: "Update the Privacy Policy.",
      });
      return { admin, owner, project, requirement, assessment };
    }

    it("moves IDENTIFIED -> NOTIFIED -> APPROVED -> IMPLEMENTED -> VALIDATED", async () => {
      const { admin, owner, project, requirement, assessment } = await seedAssessment();

      const notified = await notifyCustomerOfGovernanceImpact(admin.id, project.id, assessment.id);
      expect(notified.status).toBe("NOTIFIED");
      expect(notified.notifiedAt).not.toBeNull();

      const sentEmails = await db.sentEmail.findMany({ where: { userId: owner.id } });
      expect(sentEmails.length).toBeGreaterThan(0);
      expect(sentEmails[0]?.subject).toContain(project.name);

      const approved = await approveGovernanceRemediation(owner.id, project.id, assessment.id);
      expect(approved.status).toBe("APPROVED");
      expect(approved.approvedByUserId).toBe(owner.id);

      const implemented = await markGovernanceRemediationImplemented(
        owner.id,
        project.id,
        assessment.id,
      );
      expect(implemented.status).toBe("IMPLEMENTED");

      const validated = await validateGovernanceRemediation(owner.id, project.id, assessment.id, {
        verificationMethod: "Manual review of the republished Privacy Policy.",
        result: "The automated-decision-making disclosure was added and republished.",
      });
      expect(validated.status).toBe("VALIDATED");

      const subjectKey = `governance.${requirement.requirementKey}`;
      const status = await getLatestTruthStatus(owner.id, project.id, subjectKey);
      expect(status?.status).toBe("IMPLEMENTED");
      const evidence = await listEvidence(owner.id, project.id, { subjectKey });
      expect(evidence.length).toBe(1);
    });

    it("rejects out-of-order transitions", async () => {
      const { owner, project, assessment } = await seedAssessment();

      await expect(
        approveGovernanceRemediation(owner.id, project.id, assessment.id),
      ).rejects.toBeInstanceOf(InvalidGovernanceImpactTransitionError);
      await expect(
        markGovernanceRemediationImplemented(owner.id, project.id, assessment.id),
      ).rejects.toBeInstanceOf(InvalidGovernanceImpactTransitionError);
    });

    it("denies the customer-facing steps to a non-member", async () => {
      const { admin, project, assessment } = await seedAssessment();
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });
      await notifyCustomerOfGovernanceImpact(admin.id, project.id, assessment.id);

      await expect(
        approveGovernanceRemediation(outsider.id, project.id, assessment.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("denies notifyCustomerOfGovernanceImpact to a non-admin, even the project owner", async () => {
      const { owner, project, assessment } = await seedAssessment();

      await expect(
        notifyCustomerOfGovernanceImpact(owner.id, project.id, assessment.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("throws GovernanceImpactAssessmentNotFoundError for an unknown id", async () => {
      const { owner, project } = await seedAssessment();

      await expect(
        approveGovernanceRemediation(owner.id, project.id, "nonexistent-id"),
      ).rejects.toBeInstanceOf(GovernanceImpactAssessmentNotFoundError);
    });
  });

  describe("dismissGovernanceImpactAssessment", () => {
    it("dismisses a NOT_MATERIAL assessment with a reason, bypassing the customer workflow", async () => {
      const admin = await seedAdmin();
      const { project } = await seedProject();
      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);
      const assessment = await createGovernanceImpactAssessment(admin.id, project.id, {
        governanceRequirementId: requirement.id,
        materiality: "NOT_MATERIAL",
      });

      const dismissed = await dismissGovernanceImpactAssessment(
        admin.id,
        project.id,
        assessment.id,
        "This project does not process California residents' personal information.",
      );

      expect(dismissed.status).toBe("DISMISSED");
      expect(dismissed.dismissedReason).toContain("California");
    });

    it("rejects dismissing an assessment that already moved past IDENTIFIED", async () => {
      const admin = await seedAdmin();
      const { project } = await seedProject();
      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);
      const assessment = await createGovernanceImpactAssessment(admin.id, project.id, {
        governanceRequirementId: requirement.id,
        materiality: "MATERIAL",
      });
      await notifyCustomerOfGovernanceImpact(admin.id, project.id, assessment.id);

      await expect(
        dismissGovernanceImpactAssessment(admin.id, project.id, assessment.id, "too late"),
      ).rejects.toBeInstanceOf(InvalidGovernanceImpactTransitionError);
    });

    it("denies a non-admin", async () => {
      const admin = await seedAdmin();
      const { owner, project } = await seedProject();
      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);
      const assessment = await createGovernanceImpactAssessment(admin.id, project.id, {
        governanceRequirementId: requirement.id,
        materiality: "NOT_MATERIAL",
      });

      await expect(
        dismissGovernanceImpactAssessment(owner.id, project.id, assessment.id, "not applicable"),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("listGovernanceImpactAssessments", () => {
    it("lists every assessment for a project, denies a non-member", async () => {
      const admin = await seedAdmin();
      const { owner, project } = await seedProject();
      const requirement = await recordGovernanceRequirement(admin.id, REQUIREMENT_INPUT);
      await createGovernanceImpactAssessment(admin.id, project.id, {
        governanceRequirementId: requirement.id,
        materiality: "MATERIAL",
      });

      const assessments = await listGovernanceImpactAssessments(owner.id, project.id);
      expect(assessments).toHaveLength(1);

      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });
      await expect(listGovernanceImpactAssessments(outsider.id, project.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});
