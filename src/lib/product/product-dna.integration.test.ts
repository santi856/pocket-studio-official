// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { getLatestProductDNA, updateProductDNA } from "./product-dna";

describe("Product DNA merge-not-erase semantics", () => {
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

  it("requires originalIdea on the first version", async () => {
    const { owner, project } = await seedProject();

    await expect(
      updateProductDNA(owner.id, project.id, { purpose: "no idea yet" }),
    ).rejects.toThrow(/originalIdea/);
  });

  it("creates version 1 with the given fields", async () => {
    const { owner, project } = await seedProject();

    const dna = await updateProductDNA(owner.id, project.id, {
      originalIdea: "Premium booking app for mobile detailers",
      purpose: "Let customers book detailing appointments",
      differentiation: "Premium, trust-first booking experience",
    });

    expect(dna.version).toBe(1);
    expect(dna.purpose).toBe("Let customers book detailing appointments");
  });

  it("carries forward fields omitted from a later partial update", async () => {
    const { owner, project } = await seedProject();

    await updateProductDNA(owner.id, project.id, {
      originalIdea: "Premium booking app for mobile detailers",
      purpose: "Let customers book detailing appointments",
      differentiation: "Premium, trust-first booking experience",
    });

    // Only updates `purpose` — differentiation and originalIdea must survive.
    const v2 = await updateProductDNA(owner.id, project.id, {
      purpose: "Let customers book AND manage detailing appointments",
    });

    expect(v2.version).toBe(2);
    expect(v2.purpose).toBe("Let customers book AND manage detailing appointments");
    expect(v2.differentiation).toBe("Premium, trust-first booking experience");
    expect(v2.originalIdea).toBe("Premium booking app for mobile detailers");
  });

  it("allows explicitly clearing a field by passing null", async () => {
    const { owner, project } = await seedProject();

    await updateProductDNA(owner.id, project.id, {
      originalIdea: "Premium booking app for mobile detailers",
      productEdge: "Same-day booking",
    });

    const v2 = await updateProductDNA(owner.id, project.id, { productEdge: null });
    expect(v2.productEdge).toBeNull();
  });

  it("carries a field forward when its key is omitted entirely (not merely undefined)", async () => {
    const { owner, project } = await seedProject();

    await updateProductDNA(owner.id, project.id, {
      originalIdea: "Premium booking app for mobile detailers",
      productEdge: "Same-day booking",
    });

    const v2 = await updateProductDNA(owner.id, project.id, { purpose: "unrelated update" });
    expect(v2.productEdge).toBe("Same-day booking");
  });

  it("getLatestProductDNA reflects the most recent merged version", async () => {
    const { owner, project } = await seedProject();

    await updateProductDNA(owner.id, project.id, {
      originalIdea: "Premium booking app for mobile detailers",
      purpose: "v1 purpose",
    });
    await updateProductDNA(owner.id, project.id, { purpose: "v2 purpose" });

    const latest = await getLatestProductDNA(owner.id, project.id);
    expect(latest?.version).toBe(2);
    expect(latest?.purpose).toBe("v2 purpose");
  });
});
