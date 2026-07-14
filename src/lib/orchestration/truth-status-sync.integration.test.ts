// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { assessFeasibility } from "@/lib/orchestration/feasibility";
import { listEvidence } from "@/lib/product/evidence";
import { listLatestTruthStatuses } from "@/lib/product/truth-status";
import { syncTruthStatusFromFeasibility } from "./truth-status-sync";

describe("syncTruthStatusFromFeasibility", () => {
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

  it("maps a SUPPORTED_LATER_PHASE capability to PLANNED, never IMPLEMENTED", async () => {
    const { owner, project } = await seedProject();
    // payments.subscriptions is still genuinely SUPPORTED_LATER_PHASE (no
    // scheduled-job infrastructure exists to make billing actually
    // recur, P3-06/D-0052) — payments.deposits moved to PROTOTYPE_ONLY at
    // P3-06 since a real charge-creation mechanism now exists, so it's no
    // longer a valid example of this specific mapping.
    const report = await assessFeasibility(["payments.subscriptions"]);

    await syncTruthStatusFromFeasibility(owner.id, project.id, report);

    const statuses = await listLatestTruthStatuses(owner.id, project.id);
    const entry = statuses.find((s) => s.subjectKey === "payments.subscriptions");
    expect(entry?.status).toBe("PLANNED");
  });

  it("maps EXTERNAL_APPROVAL_REQUIRED to BLOCKED", async () => {
    const { owner, project } = await seedProject();
    const report = await assessFeasibility(["distribution.apple_google_submission"]);

    await syncTruthStatusFromFeasibility(owner.id, project.id, report);

    const statuses = await listLatestTruthStatuses(owner.id, project.id);
    const entry = statuses.find((s) => s.subjectKey === "distribution.apple_google_submission");
    expect(entry?.status).toBe("BLOCKED");
  });

  it("maps an unrecognized capability to NOT_EVALUATED with an honest rationale", async () => {
    const { owner, project } = await seedProject();
    const report = await assessFeasibility(["some.unknown.capability"]);

    await syncTruthStatusFromFeasibility(owner.id, project.id, report);

    const statuses = await listLatestTruthStatuses(owner.id, project.id);
    const entry = statuses.find((s) => s.subjectKey === "some.unknown.capability");
    expect(entry?.status).toBe("NOT_EVALUATED");
    expect(entry?.rationale).toMatch(/no supported capability registry entry/i);
  });

  it("records evidence backing every Truth Status entry it creates", async () => {
    const { owner, project } = await seedProject();
    const report = await assessFeasibility(["generation.full_stack_web_app"]);

    await syncTruthStatusFromFeasibility(owner.id, project.id, report);

    const evidence = await listEvidence(owner.id, project.id, {
      subjectKey: "generation.full_stack_web_app",
    });
    expect(evidence).toHaveLength(1);

    const statuses = await listLatestTruthStatuses(owner.id, project.id);
    const entry = statuses.find((s) => s.subjectKey === "generation.full_stack_web_app");
    expect(entry?.evidenceRef).toBe(evidence[0]?.id);
  });
});
