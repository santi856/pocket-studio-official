// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { verifyPassword } from "@/lib/auth/password";
import {
  GeneratedAppUserEmailAlreadyExistsError,
  WeakGeneratedAppUserPasswordError,
  createGeneratedAppUser,
  getGeneratedAppUser,
  listGeneratedAppUsers,
} from "./generated-app-users";

describe("generated-app users", () => {
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

  it("creates a generated-app user with a hashed password, never storing it in plaintext", async () => {
    const { owner, project } = await seedProject();

    const user = await createGeneratedAppUser(owner.id, project.id, {
      email: "customer@example.com",
      password: "correcthorsebatterystaple",
      name: "Jane Customer",
      role: "customer",
    });

    expect(user.email).toBe("customer@example.com");
    expect(user.passwordHash).not.toBe("correcthorsebatterystaple");
    expect(await verifyPassword("correcthorsebatterystaple", user.passwordHash)).toBe(true);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const { owner, project } = await seedProject();

    await expect(
      createGeneratedAppUser(owner.id, project.id, {
        email: "customer@example.com",
        password: "short",
        role: "customer",
      }),
    ).rejects.toBeInstanceOf(WeakGeneratedAppUserPasswordError);
  });

  it("rejects a duplicate email within the same project", async () => {
    const { owner, project } = await seedProject();
    await createGeneratedAppUser(owner.id, project.id, {
      email: "customer@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });

    await expect(
      createGeneratedAppUser(owner.id, project.id, {
        email: "customer@example.com",
        password: "anotherpassword",
        role: "customer",
      }),
    ).rejects.toBeInstanceOf(GeneratedAppUserEmailAlreadyExistsError);
  });

  it("allows the same email across two different projects (project-scoped uniqueness, not global)", async () => {
    const { owner, project: projectA } = await seedProject();
    const org = await createOrganization({ name: "Second Org", ownerUserId: owner.id });
    const projectB = await createProject({
      organizationId: org.id,
      name: "Second App",
      createdByUserId: owner.id,
    });

    await createGeneratedAppUser(owner.id, projectA.id, {
      email: "shared@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });

    const userB = await createGeneratedAppUser(owner.id, projectB.id, {
      email: "shared@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });

    expect(userB.email).toBe("shared@example.com");
  });

  it("lists and gets users scoped to the requesting project only", async () => {
    const { owner, project } = await seedProject();
    const created = await createGeneratedAppUser(owner.id, project.id, {
      email: "customer@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });

    const list = await listGeneratedAppUsers(owner.id, project.id);
    expect(list.map((u) => u.id)).toEqual([created.id]);

    const fetched = await getGeneratedAppUser(owner.id, project.id, created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it("denies access for an actor without project membership", async () => {
    const { project } = await seedProject();
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(
      createGeneratedAppUser(outsider.id, project.id, {
        email: "customer@example.com",
        password: "correcthorsebatterystaple",
        role: "customer",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
