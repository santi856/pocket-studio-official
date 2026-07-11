// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError, requireOrganizationMembership, requireProjectAccess } from "./authz";

describe("tenant isolation", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedTwoTenants() {
    const ownerA = await registerUser({ email: "owner-a@example.com", password: "password123" });
    const ownerB = await registerUser({ email: "owner-b@example.com", password: "password123" });

    const orgA = await createOrganization({ name: "Tenant A", ownerUserId: ownerA.id });
    const orgB = await createOrganization({ name: "Tenant B", ownerUserId: ownerB.id });

    const projectA = await createProject({
      organizationId: orgA.id,
      name: "Detailer Booking App",
      createdByUserId: ownerA.id,
    });

    return { ownerA, ownerB, orgA, orgB, projectA };
  }

  it("allows a member to access their own organization", async () => {
    const { ownerA, orgA } = await seedTwoTenants();

    const membership = await requireOrganizationMembership(ownerA.id, orgA.id);

    expect(membership.role).toBe("OWNER");
  });

  it("denies a user access to an organization they do not belong to", async () => {
    const { ownerB, orgA } = await seedTwoTenants();

    await expect(requireOrganizationMembership(ownerB.id, orgA.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("allows a member to access a project in their own organization", async () => {
    const { ownerA, projectA } = await seedTwoTenants();

    const project = await requireProjectAccess(ownerA.id, projectA.id);

    expect(project.id).toBe(projectA.id);
  });

  it("denies cross-tenant project access even with a valid project id", async () => {
    const { ownerB, projectA } = await seedTwoTenants();

    await expect(requireProjectAccess(ownerB.id, projectA.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("denies creating a project in an organization the caller does not belong to", async () => {
    const { ownerB, orgA } = await seedTwoTenants();

    await expect(
      createProject({
        organizationId: orgA.id,
        name: "Hostile project",
        createdByUserId: ownerB.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const projectsInOrgA = await db.project.findMany({ where: { organizationId: orgA.id } });
    expect(projectsInOrgA).toHaveLength(1); // only the legitimate seed project
  });

  it("enforces a minimum role above plain membership", async () => {
    const { orgA } = await seedTwoTenants();
    const member = await registerUser({ email: "member@example.com", password: "password123" });

    await db.membership.create({
      data: { userId: member.id, organizationId: orgA.id, role: "MEMBER" },
    });

    await expect(requireOrganizationMembership(member.id, orgA.id, "OWNER")).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    // MEMBER-level access still succeeds.
    await expect(requireOrganizationMembership(member.id, orgA.id, "MEMBER")).resolves.toBeTruthy();
  });

  it("throws ForbiddenError for a nonexistent project instead of leaking existence", async () => {
    const { ownerA } = await seedTwoTenants();

    await expect(requireProjectAccess(ownerA.id, "not-a-real-project-id")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
