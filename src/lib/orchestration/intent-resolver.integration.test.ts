// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createProductStateVersion } from "@/lib/product/product-state";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { resolveIntent } from "./intent-resolver";

describe("resolveIntent", () => {
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

  it("resolves the first submission on a project as describe_idea", async () => {
    const { owner, project } = await seedProject();

    const intent = await resolveIntent(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    expect(intent.type).toBe("describe_idea");
  });

  it("resolves a submission on a project that already has Product State as edit_request", async () => {
    const { owner, project } = await seedProject();
    await createProductStateVersion(owner.id, project.id, {
      originalIdea: "Build a premium booking app for mobile detailers.",
    });

    const intent = await resolveIntent(
      owner.id,
      project.id,
      "Add appointment deposits and monthly memberships.",
    );

    expect(intent.type).toBe("edit_request");
  });

  it("denies resolving intent for a non-member (tenant isolation)", async () => {
    const { outsider, project } = await seedProject();

    await expect(resolveIntent(outsider.id, project.id, "hostile request")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
