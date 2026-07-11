// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { listIntegrationRequirements, upsertIntegrationRequirement } from "./integrations";

describe("Integration Requirements", () => {
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

  it("creates a new integration requirement", async () => {
    const { owner, project } = await seedProject();

    const requirement = await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits for bookings",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "SETUP_NEEDED",
      providerOptions: ["stripe"],
    });

    expect(requirement.category).toBe("payments");
    expect(requirement.connectionStatus).toBe("SETUP_NEEDED");
  });

  it("upserts on the same category rather than creating a duplicate", async () => {
    const { owner, project } = await seedProject();

    await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "SETUP_NEEDED",
    });
    await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "CONNECTED",
      selectedProvider: "stripe",
    });

    const requirements = await listIntegrationRequirements(owner.id, project.id);
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.connectionStatus).toBe("CONNECTED");
    expect(requirements[0]?.selectedProvider).toBe("stripe");
  });

  it("denies integration access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "x",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "SETUP_NEEDED",
    });

    await expect(listIntegrationRequirements(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
