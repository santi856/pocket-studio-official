// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  addProductMemoryEntry,
  deleteProductMemoryEntry,
  listProductMemoryEntries,
} from "./product-memory";

describe("Product Memory", () => {
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

  it("records and lists memory entries in creation order", async () => {
    const { owner, project } = await seedProject();

    await addProductMemoryEntry(owner.id, project.id, {
      type: "FACT",
      content: "The business operates in three cities.",
    });
    await addProductMemoryEntry(owner.id, project.id, {
      type: "DECISION",
      content: "Chose deposits over full upfront payment.",
      metadata: { reason: "lower booking friction" },
    });

    const entries = await listProductMemoryEntries(owner.id, project.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.type).toBe("FACT");
    expect(entries[1]?.type).toBe("DECISION");
    expect(entries[1]?.metadata).toMatchObject({ reason: "lower booking friction" });
  });

  it("filters by entry type", async () => {
    const { owner, project } = await seedProject();

    await addProductMemoryEntry(owner.id, project.id, { type: "FACT", content: "fact one" });
    await addProductMemoryEntry(owner.id, project.id, {
      type: "OPEN_QUESTION",
      content: "Should we support recurring appointments in v1?",
    });

    const questions = await listProductMemoryEntries(owner.id, project.id, {
      type: "OPEN_QUESTION",
    });
    expect(questions).toHaveLength(1);
    expect(questions[0]?.content).toBe("Should we support recurring appointments in v1?");
  });

  it("deletes a single entry without affecting others", async () => {
    const { owner, project } = await seedProject();

    const entry = await addProductMemoryEntry(owner.id, project.id, {
      type: "REJECTED_OPTION",
      content: "Considered and rejected a marketplace model.",
    });
    await addProductMemoryEntry(owner.id, project.id, { type: "FACT", content: "keep this" });

    await deleteProductMemoryEntry(owner.id, project.id, entry.id);

    const remaining = await listProductMemoryEntries(owner.id, project.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.content).toBe("keep this");
  });

  it("denies reading or writing memory for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await addProductMemoryEntry(owner.id, project.id, { type: "FACT", content: "secret fact" });

    await expect(
      addProductMemoryEntry(outsider.id, project.id, { type: "FACT", content: "hostile write" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(listProductMemoryEntries(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
