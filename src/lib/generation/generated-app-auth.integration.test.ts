// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createGeneratedAppUser } from "./generated-app-users";
import {
  InvalidGeneratedAppCredentialsError,
  authenticateGeneratedAppUser,
} from "./generated-app-auth";

describe("authenticateGeneratedAppUser", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithGeneratedAppUser() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const generatedUser = await createGeneratedAppUser(owner.id, project.id, {
      email: "customer@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });
    return { owner, project, generatedUser };
  }

  it("authenticates with the correct email and password", async () => {
    const { project, generatedUser } = await seedProjectWithGeneratedAppUser();

    const authenticated = await authenticateGeneratedAppUser(
      project.id,
      "customer@example.com",
      "correcthorsebatterystaple",
    );

    expect(authenticated.id).toBe(generatedUser.id);
  });

  it("rejects an incorrect password", async () => {
    const { project } = await seedProjectWithGeneratedAppUser();

    await expect(
      authenticateGeneratedAppUser(project.id, "customer@example.com", "wrong-password"),
    ).rejects.toBeInstanceOf(InvalidGeneratedAppCredentialsError);
  });

  it("rejects an email that does not exist for this project", async () => {
    const { project } = await seedProjectWithGeneratedAppUser();

    await expect(
      authenticateGeneratedAppUser(project.id, "nobody@example.com", "correcthorsebatterystaple"),
    ).rejects.toBeInstanceOf(InvalidGeneratedAppCredentialsError);
  });

  it("does not authenticate the same email against a different project", async () => {
    const { owner } = await seedProjectWithGeneratedAppUser();
    const org = await createOrganization({ name: "Second Org", ownerUserId: owner.id });
    const projectB = await createProject({
      organizationId: org.id,
      name: "Second App",
      createdByUserId: owner.id,
    });

    await expect(
      authenticateGeneratedAppUser(
        projectB.id,
        "customer@example.com",
        "correcthorsebatterystaple",
      ),
    ).rejects.toBeInstanceOf(InvalidGeneratedAppCredentialsError);
  });
});
