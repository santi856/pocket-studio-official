// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  DecisionNotPendingError,
  listDecisions,
  recordDecision,
  respondToDecision,
} from "./decisions";

describe("Decision Ledger disclosure tiers and approval", () => {
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

  it("auto-applies a ROUTINE decision", async () => {
    const { owner, project } = await seedProject();

    const decision = await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Chose a default color palette.",
      disclosureTier: "ROUTINE",
    });

    expect(decision.approvalStatus).toBe("AUTO_APPLIED");
  });

  it("marks an IMPORTANT decision as recommended, not yet approved", async () => {
    const { owner, project } = await seedProject();

    const decision = await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Recommend weekly digest emails.",
      disclosureTier: "IMPORTANT",
    });

    expect(decision.approvalStatus).toBe("RECOMMENDED");
  });

  it("holds a CONSEQUENTIAL decision pending until explicitly approved", async () => {
    const { owner, project } = await seedProject();

    const decision = await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Enable production payment processing.",
      disclosureTier: "CONSEQUENTIAL",
    });

    expect(decision.approvalStatus).toBe("PENDING_APPROVAL");

    const approved = await respondToDecision(owner.id, project.id, decision.id, {
      approve: true,
      customerResponse: "Approved, go ahead.",
    });

    expect(approved.approvalStatus).toBe("APPROVED");
    expect(approved.respondedByUserId).toBe(owner.id);
    expect(approved.respondedAt).not.toBeNull();
  });

  it("rejects a CONSEQUENTIAL decision when the customer declines", async () => {
    const { owner, project } = await seedProject();

    const decision = await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Enable production payment processing.",
      disclosureTier: "CONSEQUENTIAL",
    });

    const rejected = await respondToDecision(owner.id, project.id, decision.id, {
      approve: false,
      customerResponse: "Not yet.",
    });

    expect(rejected.approvalStatus).toBe("REJECTED");
  });

  it("refuses to respond to a decision that is not pending", async () => {
    const { owner, project } = await seedProject();

    const decision = await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Routine choice.",
      disclosureTier: "ROUTINE",
    });

    await expect(
      respondToDecision(owner.id, project.id, decision.id, { approve: true }),
    ).rejects.toBeInstanceOf(DecisionNotPendingError);
  });

  it("lists decisions filtered by approval status", async () => {
    const { owner, project } = await seedProject();

    await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Routine one.",
      disclosureTier: "ROUTINE",
    });
    await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Needs approval.",
      disclosureTier: "CONSEQUENTIAL",
    });

    const pending = await listDecisions(owner.id, project.id, {
      approvalStatus: "PENDING_APPROVAL",
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]?.summary).toBe("Needs approval.");
  });

  it("denies decision access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await recordDecision(owner.id, project.id, {
      source: "test",
      summary: "Owner's decision.",
      disclosureTier: "ROUTINE",
    });

    await expect(listDecisions(outsider.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
