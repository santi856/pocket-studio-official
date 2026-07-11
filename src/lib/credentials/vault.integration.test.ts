// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { upsertIntegrationRequirement } from "@/lib/product/integrations";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  getCredentialMetadata,
  IntegrationRequirementNotFoundError,
  retrieveCredentialSecret,
  storeCredential,
} from "./vault";

describe("Credential vault", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithRequirement() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const requirement = await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "SETUP_NEEDED",
    });
    return { owner, outsider, project, requirement };
  }

  it("stores a credential and retrieves the exact secret back", async () => {
    const { owner, project, requirement } = await seedProjectWithRequirement();

    await storeCredential(owner.id, project.id, {
      integrationRequirementId: requirement.id,
      provider: "stripe",
      secret: "sk_test_abc123",
    });

    const secret = await retrieveCredentialSecret(owner.id, project.id, requirement.id);
    expect(secret).toBe("sk_test_abc123");
  });

  it("never stores the plaintext secret in the database row", async () => {
    const { owner, project, requirement } = await seedProjectWithRequirement();

    await storeCredential(owner.id, project.id, {
      integrationRequirementId: requirement.id,
      provider: "stripe",
      secret: "sk_test_abc123",
    });

    const row = await db.credentialReference.findFirst({
      where: { integrationRequirementId: requirement.id },
    });
    expect(row?.ciphertext).toBeDefined();
    expect(row?.ciphertext).not.toContain("sk_test_abc123");
  });

  it("getCredentialMetadata never exposes ciphertext, iv, or authTag", async () => {
    const { owner, project, requirement } = await seedProjectWithRequirement();

    await storeCredential(owner.id, project.id, {
      integrationRequirementId: requirement.id,
      provider: "stripe",
      secret: "sk_test_abc123",
    });

    const metadata = await getCredentialMetadata(owner.id, project.id, requirement.id);
    expect(metadata).not.toHaveProperty("ciphertext");
    expect(metadata).not.toHaveProperty("iv");
    expect(metadata).not.toHaveProperty("authTag");
    expect(metadata?.provider).toBe("stripe");
  });

  it("replaces a credential on the same requirement (rotation), not accumulate duplicates", async () => {
    const { owner, project, requirement } = await seedProjectWithRequirement();

    await storeCredential(owner.id, project.id, {
      integrationRequirementId: requirement.id,
      provider: "stripe",
      secret: "sk_test_old",
    });
    await storeCredential(owner.id, project.id, {
      integrationRequirementId: requirement.id,
      provider: "stripe",
      secret: "sk_test_new",
    });

    const count = await db.credentialReference.count({
      where: { integrationRequirementId: requirement.id },
    });
    expect(count).toBe(1);
    expect(await retrieveCredentialSecret(owner.id, project.id, requirement.id)).toBe(
      "sk_test_new",
    );
  });

  it("rejects storing a credential against a nonexistent integration requirement", async () => {
    const { owner, project } = await seedProjectWithRequirement();

    await expect(
      storeCredential(owner.id, project.id, {
        integrationRequirementId: "not-a-real-id",
        provider: "stripe",
        secret: "sk_test_abc123",
      }),
    ).rejects.toBeInstanceOf(IntegrationRequirementNotFoundError);
  });

  it("denies credential access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project, requirement } = await seedProjectWithRequirement();
    await storeCredential(owner.id, project.id, {
      integrationRequirementId: requirement.id,
      provider: "stripe",
      secret: "sk_test_abc123",
    });

    await expect(
      retrieveCredentialSecret(outsider.id, project.id, requirement.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
