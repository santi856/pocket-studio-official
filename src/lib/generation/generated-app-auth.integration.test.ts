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
  GeneratedAppEmailAlreadyRegisteredError,
  GeneratedAppWeakPasswordError,
  authenticateGeneratedAppUser,
  signUpGeneratedAppUser,
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

  it("authenticates case-insensitively against the email a sign-up normalized", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });

    await signUpGeneratedAppUser(
      project.id,
      "Customer@Example.com",
      "correcthorsebatterystaple",
      "Cust",
    );

    const authenticated = await authenticateGeneratedAppUser(
      project.id,
      "customer@EXAMPLE.com",
      "correcthorsebatterystaple",
    );
    expect(authenticated.email).toBe("customer@example.com");
  });
});

describe("signUpGeneratedAppUser", () => {
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

  it("creates a real GeneratedAppUser with the primary customer-facing role", async () => {
    const { project } = await seedProject();

    const user = await signUpGeneratedAppUser(
      project.id,
      "New.Customer@Example.com",
      "correcthorsebatterystaple",
      "New Customer",
    );

    expect(user.email).toBe("new.customer@example.com");
    expect(user.role).toBe("customer");
    expect(user.name).toBe("New Customer");
    expect(user.projectId).toBe(project.id);
  });

  it("rejects a password shorter than the minimum length", async () => {
    const { project } = await seedProject();

    await expect(
      signUpGeneratedAppUser(project.id, "customer@example.com", "short", undefined),
    ).rejects.toBeInstanceOf(GeneratedAppWeakPasswordError);
  });

  it("rejects a duplicate email within the same project", async () => {
    const { project } = await seedProject();
    await signUpGeneratedAppUser(
      project.id,
      "customer@example.com",
      "correcthorsebatterystaple",
      undefined,
    );

    await expect(
      signUpGeneratedAppUser(project.id, "customer@example.com", "anotherpassword", undefined),
    ).rejects.toBeInstanceOf(GeneratedAppEmailAlreadyRegisteredError);
  });

  it("allows the same email to sign up for two different projects", async () => {
    const { owner, project: projectA } = await seedProject();
    const org = await createOrganization({ name: "Second Org", ownerUserId: owner.id });
    const projectB = await createProject({
      organizationId: org.id,
      name: "Second App",
      createdByUserId: owner.id,
    });

    await signUpGeneratedAppUser(
      projectA.id,
      "shared@example.com",
      "correcthorsebatterystaple",
      undefined,
    );
    const userB = await signUpGeneratedAppUser(
      projectB.id,
      "shared@example.com",
      "correcthorsebatterystaple",
      undefined,
    );

    expect(userB.projectId).toBe(projectB.id);
  });

  it("can authenticate immediately after signing up", async () => {
    const { project } = await seedProject();
    await signUpGeneratedAppUser(
      project.id,
      "customer@example.com",
      "correcthorsebatterystaple",
      undefined,
    );

    const authenticated = await authenticateGeneratedAppUser(
      project.id,
      "customer@example.com",
      "correcthorsebatterystaple",
    );
    expect(authenticated.role).toBe("customer");
  });
});
