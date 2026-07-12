// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { listDecisions } from "@/lib/product/decisions";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { getLatestBlueprint } from "@/lib/generation/blueprint";
import { listEvents } from "@/lib/product/events";
import { beginChangeFlow, respondToChangeSetDecision } from "./change-flow";

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

  it("immediately applies a non-consequential edit's Change Set and regenerates when it adds a new category", async () => {
    const { owner, project } = await seedProject();
    await beginChangeFlow(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    const result = await beginChangeFlow(
      owner.id,
      project.id,
      "Add a database of customer records.",
    );

    expect(result.decision.disclosureTier).toBe("IMPORTANT");
    expect(result.decision.approvalStatus).toBe("RECOMMENDED");
    expect(result.changeSet?.status).toBe("APPLIED");
    expect(result.changeSet?.requiresRegeneration).toBe(true);
    expect(result.changeSet?.resultingBlueprintVersion).toBe(1);

    const blueprint = await getLatestBlueprint(owner.id, project.id);
    expect(blueprint?.dataModels).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Record" })]),
    );
  });

  it("applies a Change Set with no new signal without creating a no-op Blueprint version", async () => {
    const { owner, project } = await seedProject();
    await beginChangeFlow(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );

    const result = await beginChangeFlow(owner.id, project.id, "Please make it nice.");

    expect(result.changeSet?.status).toBe("APPLIED");
    expect(result.changeSet?.requiresRegeneration).toBe(false);
    expect(result.changeSet?.resultingBlueprintVersion).toBeNull();
    expect(result.changeSet?.resultSummary).toContain("No structural change was needed");

    const blueprint = await getLatestBlueprint(owner.id, project.id);
    expect(blueprint).toBeNull();
  });

  it("leaves a CONSEQUENTIAL edit's Change Set PENDING until approved, then applies and regenerates it", async () => {
    const { owner, project } = await seedProject();
    await beginChangeFlow(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );
    const first = await beginChangeFlow(
      owner.id,
      project.id,
      "Add appointment deposits and monthly memberships.",
    );

    expect(first.changeSet?.status).toBe("PENDING");
    expect(await getLatestBlueprint(owner.id, project.id)).toBeNull();

    await respondToChangeSetDecision(owner.id, project.id, first.decision.id, { approve: true });

    const blueprint = await getLatestBlueprint(owner.id, project.id);
    expect(blueprint?.version).toBe(1);
    const events = await listEvents(owner.id, project.id, { type: "CHANGE_SET_APPLIED" });
    expect(events).toHaveLength(1);
  });

  it("rejects a CONSEQUENTIAL edit's Change Set without regenerating when declined", async () => {
    const { owner, project } = await seedProject();
    await beginChangeFlow(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );
    const first = await beginChangeFlow(
      owner.id,
      project.id,
      "Add appointment deposits and monthly memberships.",
    );

    await respondToChangeSetDecision(owner.id, project.id, first.decision.id, { approve: false });

    expect(await getLatestBlueprint(owner.id, project.id)).toBeNull();
    const events = await listEvents(owner.id, project.id, { type: "CHANGE_SET_REJECTED" });
    expect(events).toHaveLength(1);
  });

  it("preserves every prior Decision untouched when responding to a later Change Set decision", async () => {
    const { owner, project } = await seedProject();
    const initial = await beginChangeFlow(
      owner.id,
      project.id,
      "Build a premium booking app for mobile detailers.",
    );
    const edit = await beginChangeFlow(
      owner.id,
      project.id,
      "Add appointment deposits and monthly memberships.",
    );

    await respondToChangeSetDecision(owner.id, project.id, edit.decision.id, { approve: true });

    const decisions = await listDecisions(owner.id, project.id);
    const initialDecision = decisions.find((d) => d.id === initial.decision.id);
    expect(initialDecision?.approvalStatus).toBe("AUTO_APPLIED");
    expect(initialDecision?.summary).toBe(initial.decision.summary);
  });
});
