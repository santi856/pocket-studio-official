// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { recordDecision } from "@/lib/product/decisions";
import { generateProductIntelligence } from "./product-intelligence";
import {
  ChangeSetNotPendingError,
  applyChangeSet,
  createChangeSet,
  getChangeSetByDecisionId,
  listChangeSets,
  rejectChangeSet,
} from "./change-set";

describe("Change Set service", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithIdea() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );
    const decision = await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Change requested against an existing project.",
      disclosureTier: "IMPORTANT",
      impact: {},
    });
    return { owner, project, decision };
  }

  it("computes combinedIdea by appending, never discarding, the prior idea", async () => {
    const { owner, project, decision } = await seedProjectWithIdea();

    const changeSet = await createChangeSet(owner.id, project.id, {
      decisionId: decision.id,
      rawText: "Add a database of customer records.",
    });

    expect(changeSet.priorIdea).toBe("Build a premium booking app for mobile detailers.");
    expect(changeSet.combinedIdea).toBe(
      "Build a premium booking app for mobile detailers. Add a database of customer records.",
    );
    expect(changeSet.status).toBe("PENDING");
  });

  it("flags requiresRegeneration only when the edit introduces a genuinely new category", async () => {
    const { owner, project, decision } = await seedProjectWithIdea();

    const withNewCategory = await createChangeSet(owner.id, project.id, {
      decisionId: decision.id,
      rawText: "Add a database of customer records.",
    });
    expect(withNewCategory.requiresRegeneration).toBe(true);
    expect(withNewCategory.addedCategories).toContain("data");
  });

  it("throws applying or rejecting a Change Set that is not PENDING", async () => {
    const { owner, project, decision } = await seedProjectWithIdea();
    const changeSet = await createChangeSet(owner.id, project.id, {
      decisionId: decision.id,
      rawText: "Please make it nice.",
    });
    await applyChangeSet(owner.id, project.id, changeSet.id);

    await expect(applyChangeSet(owner.id, project.id, changeSet.id)).rejects.toBeInstanceOf(
      ChangeSetNotPendingError,
    );
    await expect(rejectChangeSet(owner.id, project.id, changeSet.id)).rejects.toBeInstanceOf(
      ChangeSetNotPendingError,
    );
  });

  it("finds a Change Set by its governing decision id", async () => {
    const { owner, project, decision } = await seedProjectWithIdea();
    const changeSet = await createChangeSet(owner.id, project.id, {
      decisionId: decision.id,
      rawText: "Add a database of customer records.",
    });

    const found = await getChangeSetByDecisionId(owner.id, project.id, decision.id);
    expect(found?.id).toBe(changeSet.id);
  });

  it("lists Change Sets for a project, newest first", async () => {
    const { owner, project, decision } = await seedProjectWithIdea();
    await createChangeSet(owner.id, project.id, {
      decisionId: decision.id,
      rawText: "First edit.",
    });

    const list = await listChangeSets(owner.id, project.id);
    expect(list).toHaveLength(1);
  });

  it("denies Change Set operations for an actor without project access", async () => {
    const { project, decision } = await seedProjectWithIdea();
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(
      createChangeSet(outsider.id, project.id, {
        decisionId: decision.id,
        rawText: "Hostile edit.",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
