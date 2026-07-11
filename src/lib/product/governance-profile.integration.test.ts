// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { getGovernanceProfile, upsertGovernanceProfile } from "./governance-profile";

describe("Governance Profile", () => {
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

  it("creates a profile on first upsert", async () => {
    const { owner, project } = await seedProject();

    const profile = await upsertGovernanceProfile(owner.id, project.id, {
      productCategory: "service-business booking",
      userAgeRange: "18+",
      relevantGovernanceDomains: ["privacy", "payments"],
    });

    expect(profile.productCategory).toBe("service-business booking");
  });

  it("updates the existing profile in place rather than creating a second row", async () => {
    const { owner, project } = await seedProject();

    await upsertGovernanceProfile(owner.id, project.id, { productCategory: "v1" });
    await upsertGovernanceProfile(owner.id, project.id, { productCategory: "v2" });

    const profile = await getGovernanceProfile(owner.id, project.id);
    expect(profile?.productCategory).toBe("v2");

    const count = await db.governanceProfile.count({ where: { projectId: project.id } });
    expect(count).toBe(1);
  });

  it("returns null when no profile has been created yet", async () => {
    const { owner, project } = await seedProject();
    expect(await getGovernanceProfile(owner.id, project.id)).toBeNull();
  });

  it("denies governance profile access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await upsertGovernanceProfile(owner.id, project.id, { productCategory: "x" });

    await expect(getGovernanceProfile(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
