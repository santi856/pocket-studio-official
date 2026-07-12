// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { generateProductIntelligence } from "./product-intelligence";
import { generateInitialBlueprint } from "@/lib/generation/blueprint-generator";
import { getGovernanceProfile } from "@/lib/product/governance-profile";
import { listPolicyDocuments } from "@/lib/product/policy-documents";
import { listProductMemoryEntries } from "@/lib/product/product-memory";
import {
  NoBlueprintForAssessmentError,
  generatePolicyDraft,
  recordSecurityPrivacyGovernanceAssessment,
  syncGovernanceProfile,
} from "./governance-and-legal";

describe("governance and legal", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithBlueprint(idea: string) {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    await generateProductIntelligence(owner.id, project.id, idea);
    await generateInitialBlueprint(owner.id, project.id);
    return { owner, project };
  }

  describe("syncGovernanceProfile", () => {
    it("throws NoBlueprintForAssessmentError when the project has no Blueprint yet", async () => {
      const owner = await registerUser({ email: "owner@example.com", password: "password123" });
      const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
      const project = await createProject({
        organizationId: org.id,
        name: "Booking App",
        createdByUserId: owner.id,
      });

      await expect(syncGovernanceProfile(owner.id, project.id)).rejects.toBeInstanceOf(
        NoBlueprintForAssessmentError,
      );
    });

    it("derives real data categories and monetization model from the Blueprint, never inventing jurisdiction facts", async () => {
      const { owner, project } = await seedProjectWithBlueprint(
        "Build a booking app with appointment deposits.",
      );

      const profile = await syncGovernanceProfile(owner.id, project.id);

      expect(profile.dataCategories).toEqual(expect.arrayContaining(["Payment/transaction data"]));
      expect(profile.monetizationModel).toContain("Collect payment");
      expect(profile.businessLocations).toBeNull();
      expect(profile.productCategory).toBeNull();
    });
  });

  describe("recordSecurityPrivacyGovernanceAssessment", () => {
    it("derives security/privacy requirements grounded in the Blueprint's real content", async () => {
      const { owner, project } = await seedProjectWithBlueprint(
        "Build a booking app with a database of customer records and appointment deposits.",
      );

      const decision = await recordSecurityPrivacyGovernanceAssessment(owner.id, project.id);

      expect(decision.disclosureTier).toBe("ROUTINE");
      const impact = decision.impact as { security: string[]; privacy: string[] };
      expect(impact.security.some((r) => r.includes("PCI-compliant"))).toBe(true);
      expect(impact.privacy.some((r) => r.includes("Retention and deletion"))).toBe(true);
    });

    it("also syncs the Governance Profile as part of the same assessment", async () => {
      const { owner, project } = await seedProjectWithBlueprint(
        "Build a booking app with appointment deposits.",
      );

      await recordSecurityPrivacyGovernanceAssessment(owner.id, project.id);

      const profile = await getGovernanceProfile(owner.id, project.id);
      expect(profile?.monetizationModel).toContain("Collect payment");
    });

    it("denies assessment for an actor without project access", async () => {
      const { project } = await seedProjectWithBlueprint("Build a booking app.");
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });

      await expect(
        recordSecurityPrivacyGovernanceAssessment(outsider.id, project.id),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("generatePolicyDraft", () => {
    it("generates a Terms of Service draft reflecting the real product purpose and monetization", async () => {
      const { owner, project } = await seedProjectWithBlueprint(
        "Build a premium booking app for mobile detailers with appointment deposits.",
      );

      const draft = await generatePolicyDraft(owner.id, project.id, "TERMS_OF_SERVICE");

      expect(draft.status).toBe("DRAFT");
      expect(draft.content).toContain("mobile detailers");
      expect(draft.content).toContain("[COMPANY NAME");
      expect(draft.content).toContain("legal counsel");
    });

    it("generates a Privacy Policy draft listing real data categories", async () => {
      const { owner, project } = await seedProjectWithBlueprint(
        "Build a booking app with a database of customer records.",
      );

      const draft = await generatePolicyDraft(owner.id, project.id, "PRIVACY_POLICY");

      expect(draft.content).toContain("Record");
    });

    it("generates an AI Disclosure draft that honestly labels deterministic generation", async () => {
      const { owner, project } = await seedProjectWithBlueprint("Build a booking app.");

      const draft = await generatePolicyDraft(owner.id, project.id, "AI_DISCLOSURE");

      expect(draft.content).toContain("deterministic");
      expect(draft.content).toContain("not a live AI model making product decisions");
    });

    it("records an open question for every genuinely unknown legal fact", async () => {
      const { owner, project } = await seedProjectWithBlueprint("Build a booking app.");

      await generatePolicyDraft(owner.id, project.id, "TERMS_OF_SERVICE");

      const questions = await listProductMemoryEntries(owner.id, project.id, {
        type: "OPEN_QUESTION",
      });
      expect(questions.some((q) => q.content.includes("company name"))).toBe(true);
    });

    it("is versioned per type: generating twice creates version 2, not a duplicate row", async () => {
      const { owner, project } = await seedProjectWithBlueprint("Build a booking app.");

      await generatePolicyDraft(owner.id, project.id, "TERMS_OF_SERVICE");
      await generatePolicyDraft(owner.id, project.id, "TERMS_OF_SERVICE");

      const documents = await listPolicyDocuments(owner.id, project.id);
      const tosVersions = documents
        .filter((d) => d.type === "TERMS_OF_SERVICE")
        .map((d) => d.version);
      expect(tosVersions.sort()).toEqual([1, 2]);
    });

    it("denies draft generation for an actor without project access", async () => {
      const { project } = await seedProjectWithBlueprint("Build a booking app.");
      const outsider = await registerUser({
        email: "outsider@example.com",
        password: "password123",
      });

      await expect(
        generatePolicyDraft(outsider.id, project.id, "PRIVACY_POLICY"),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
