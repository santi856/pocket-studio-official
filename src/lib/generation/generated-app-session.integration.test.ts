// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createGeneratedAppUser } from "./generated-app-users";
import {
  InvalidGeneratedAppSessionError,
  createGeneratedAppSession,
  requireGeneratedAppSessionForProject,
  deleteGeneratedAppSessionByToken,
} from "./generated-app-session";

describe("generated-app-session", () => {
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

  it("issues a session that resolves back to the same GeneratedAppUser for the same project", async () => {
    const { project, generatedUser } = await seedProjectWithGeneratedAppUser();

    const { token } = await createGeneratedAppSession(generatedUser.id);
    const resolved = await requireGeneratedAppSessionForProject(token, project.id);

    expect(resolved.id).toBe(generatedUser.id);
  });

  it("rejects a token that does not exist", async () => {
    const { project } = await seedProjectWithGeneratedAppUser();

    await expect(
      requireGeneratedAppSessionForProject("not-a-real-token", project.id),
    ).rejects.toBeInstanceOf(InvalidGeneratedAppSessionError);
  });

  it("rejects a real session token when checked against a different project", async () => {
    const { owner, generatedUser } = await seedProjectWithGeneratedAppUser();
    const org = await createOrganization({ name: "Second Org", ownerUserId: owner.id });
    const otherProject = await createProject({
      organizationId: org.id,
      name: "Second App",
      createdByUserId: owner.id,
    });

    const { token } = await createGeneratedAppSession(generatedUser.id);

    await expect(
      requireGeneratedAppSessionForProject(token, otherProject.id),
    ).rejects.toBeInstanceOf(InvalidGeneratedAppSessionError);
  });

  it("rejects an expired session", async () => {
    const { project, generatedUser } = await seedProjectWithGeneratedAppUser();

    const { token } = await createGeneratedAppSession(generatedUser.id);
    await db.generatedAppSession.updateMany({
      where: { generatedAppUserId: generatedUser.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(requireGeneratedAppSessionForProject(token, project.id)).rejects.toBeInstanceOf(
      InvalidGeneratedAppSessionError,
    );
  });

  it("rejects a token after it has been deleted (sign-out)", async () => {
    const { project, generatedUser } = await seedProjectWithGeneratedAppUser();

    const { token } = await createGeneratedAppSession(generatedUser.id);
    await deleteGeneratedAppSessionByToken(token);

    await expect(requireGeneratedAppSessionForProject(token, project.id)).rejects.toBeInstanceOf(
      InvalidGeneratedAppSessionError,
    );
  });

  it("stores only a hash of the token, never the raw value", async () => {
    const { generatedUser } = await seedProjectWithGeneratedAppUser();

    const { token } = await createGeneratedAppSession(generatedUser.id);
    const stored = await db.generatedAppSession.findMany({
      where: { generatedAppUserId: generatedUser.id },
    });

    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).not.toBe(token);
  });
});
