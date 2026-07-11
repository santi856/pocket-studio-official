// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { listDecisions } from "@/lib/product/decisions";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { beginChangeFlow } from "./change-flow";

describe("beginChangeFlow", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
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

  it("resolves intent, analyzes impact, and records a ROUTINE decision for a plain idea", async () => {
    const { owner, project } = await seedProject();

    const result = await beginChangeFlow(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    expect(result.intent.type).toBe("describe_idea");
    expect(result.impact.consequential).toBe(false);
    expect(result.decision.disclosureTier).toBe("ROUTINE");
    expect(result.decision.approvalStatus).toBe("AUTO_APPLIED");
    expect(result.productIntelligence?.productState.version).toBe(1);
  });

  it("does not generate Product Intelligence for a follow-up edit_request", async () => {
    const { owner, project } = await seedProject();

    await beginChangeFlow(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );
    const second = await beginChangeFlow(
      owner.id,
      project.id,
      "Add appointment deposits and monthly memberships.",
    );

    expect(second.intent.type).toBe("edit_request");
    expect(second.productIntelligence).toBeUndefined();
  });

  it("records a CONSEQUENTIAL decision pending approval for a monetization request", async () => {
    const { owner, project } = await seedProject();

    const result = await beginChangeFlow(
      owner.id,
      project.id,
      "Add appointment deposits and monthly memberships.",
    );

    expect(result.impact.consequential).toBe(true);
    expect(result.decision.disclosureTier).toBe("CONSEQUENTIAL");
    expect(result.decision.approvalStatus).toBe("PENDING_APPROVAL");

    const decisions = await listDecisions(owner.id, project.id);
    expect(decisions).toHaveLength(1);
  });
});
