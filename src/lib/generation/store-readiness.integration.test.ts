// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "./blueprint-generator";
import { generateMobileProject } from "./mobile";
import { createPolicyDocumentDraft } from "@/lib/product/policy-documents";
import { getLatestTruthStatus } from "@/lib/product/truth-status";
import { listEvidence } from "@/lib/product/evidence";
import { NoBlueprintForStoreReadinessError, assessStoreReadiness } from "./store-readiness";

describe("assessStoreReadiness", () => {
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
    return { owner, project };
  }

  it("throws NoBlueprintForStoreReadinessError when no Blueprint exists yet", async () => {
    const { owner, project } = await seedProject();

    await expect(assessStoreReadiness(owner.id, project.id)).rejects.toBeInstanceOf(
      NoBlueprintForStoreReadinessError,
    );
  });

  it("is always NOT_READY and reports real, itemized blockers for a bare project", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers with appointment deposits.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const result = await assessStoreReadiness(owner.id, project.id);

    expect(result.readinessStatus).toBe("NOT_READY");
    expect(result.mobileCommerce.categories).toContain("physical_services");
    expect(result.blockers).toContain("Apple/Google developer account connected");
    expect(result.blockers).toContain("Mobile project generated and syntax-validated");
    expect(result.blockers).toContain("Terms of Service drafted");
    expect(result.blockers).toContain("Privacy Policy drafted");
  });

  it("marks mobile-project and policy checks ready once the real work exists, but stays NOT_READY overall", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers with appointment deposits.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    await generateMobileProject(owner.id, project.id);
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "TERMS_OF_SERVICE",
      content: "Terms.",
    });
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "Privacy.",
    });

    const result = await assessStoreReadiness(owner.id, project.id);

    expect(result.readinessStatus).toBe("NOT_READY");
    expect(result.blockers).toEqual(["Apple/Google developer account connected"]);
    const mobileCheck = result.checks.find(
      (c) => c.name === "Mobile project generated and syntax-validated",
    );
    expect(mobileCheck?.ready).toBe(true);
  });

  it("records evidence and syncs store.readiness Truth Status to BLOCKED", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);

    await assessStoreReadiness(owner.id, project.id);

    const status = await getLatestTruthStatus(owner.id, project.id, "store.readiness");
    expect(status?.status).toBe("BLOCKED");

    const evidence = await listEvidence(owner.id, project.id, { subjectKey: "store.readiness" });
    expect(evidence.length).toBe(1);
    expect(evidence[0]?.evidenceType).toBe("QUALITY_GATE_CHECK");
  });

  it("honestly reports unclassified mobile commerce when monetization exists but the idea gives no category signal", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build an app that lets people submit a one-time payment for premium journal templates.",
    );
    await generateInitialBlueprint(owner.id, project.id);

    const result = await assessStoreReadiness(owner.id, project.id);

    expect(result.mobileCommerce.hasCommerce).toBe(true);
    expect(result.mobileCommerce.unclassified).toBe(true);
    expect(result.mobileCommerce.categories).toEqual([]);
  });

  it("denies store readiness assessment for an actor without project access", async () => {
    const { owner, project } = await seedProject();
    await generateProductIntelligence(owner.id, project.id, "Build a booking app.");
    await generateInitialBlueprint(owner.id, project.id);
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(assessStoreReadiness(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
