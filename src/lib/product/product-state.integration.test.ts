// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  createProductStateVersion,
  getLatestProductState,
  listProductStateVersions,
} from "./product-state";

describe("Canonical Product State versioning", () => {
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
    return { owner, outsider, org, project };
  }

  it("creates version 1 on the first call", async () => {
    const { owner, project } = await seedProject();

    const state = await createProductStateVersion(owner.id, project.id, {
      originalIdea: "Build a premium booking app for mobile detailers.",
    });

    expect(state.version).toBe(1);
    expect(state.originalIdea).toBe("Build a premium booking app for mobile detailers.");
  });

  it("increments the version on each subsequent call and preserves history", async () => {
    const { owner, project } = await seedProject();

    await createProductStateVersion(owner.id, project.id, { originalIdea: "v1 idea" });
    await createProductStateVersion(owner.id, project.id, { originalIdea: "v2 idea" });
    const third = await createProductStateVersion(owner.id, project.id, {
      originalIdea: "v3 idea",
    });

    expect(third.version).toBe(3);

    const history = await listProductStateVersions(owner.id, project.id);
    expect(history.map((s) => s.version)).toEqual([3, 2, 1]);
  });

  it("getLatestProductState returns the most recent version", async () => {
    const { owner, project } = await seedProject();

    await createProductStateVersion(owner.id, project.id, { originalIdea: "old" });
    await createProductStateVersion(owner.id, project.id, { originalIdea: "new" });

    const latest = await getLatestProductState(owner.id, project.id);
    expect(latest?.originalIdea).toBe("new");
    expect(latest?.version).toBe(2);
  });

  it("stores structured Product Intelligence and Business Model Brief data", async () => {
    const { owner, project } = await seedProject();

    const state = await createProductStateVersion(owner.id, project.id, {
      originalIdea: "Build a premium booking app for mobile detailers.",
      productIntelligence: {
        purpose: "Book mobile detailing appointments",
        targetCustomer: "car owners",
      },
      businessModelBrief: { revenueModel: "deposits + subscriptions" },
    });

    expect(state.productIntelligence).toMatchObject({
      purpose: "Book mobile detailing appointments",
    });
    expect(state.businessModelBrief).toMatchObject({ revenueModel: "deposits + subscriptions" });
  });

  it("denies reading or writing Product State for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await createProductStateVersion(owner.id, project.id, { originalIdea: "idea" });

    await expect(
      createProductStateVersion(outsider.id, project.id, { originalIdea: "hostile write" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(getLatestProductState(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
