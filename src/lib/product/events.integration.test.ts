// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { listEvents, recordEvent } from "./events";

describe("Product Event Ledger", () => {
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

  it("records an event and lists it back, newest first", async () => {
    const { owner, project } = await seedProject();

    await recordEvent(owner.id, project.id, {
      type: "PRODUCT_STATE_VERSION_CREATED",
      summary: "First event.",
    });
    await recordEvent(owner.id, project.id, {
      type: "DECISION_RECORDED",
      summary: "Second event.",
    });

    const events = await listEvents(owner.id, project.id);
    expect(events).toHaveLength(2);
    expect(events[0]?.summary).toBe("Second event.");
  });

  it("filters by event type", async () => {
    const { owner, project } = await seedProject();

    await recordEvent(owner.id, project.id, {
      type: "PRODUCT_STATE_VERSION_CREATED",
      summary: "State event.",
    });
    await recordEvent(owner.id, project.id, {
      type: "DECISION_RECORDED",
      summary: "Decision event.",
    });

    const stateEvents = await listEvents(owner.id, project.id, {
      type: "PRODUCT_STATE_VERSION_CREATED",
    });
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]?.summary).toBe("State event.");
  });

  it("denies event access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await recordEvent(owner.id, project.id, { type: "DECISION_RECORDED", summary: "secret" });

    await expect(listEvents(outsider.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
