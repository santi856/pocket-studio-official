// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { getLatestTruthStatus, listLatestTruthStatuses, setTruthStatus } from "./truth-status";

describe("Truth Status versioning", () => {
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

  it("creates version 1 on first write", async () => {
    const { owner, project } = await seedProject();

    const entry = await setTruthStatus(owner.id, project.id, {
      subjectKey: "generation.full_stack_web_app",
      subjectLabel: "Full-stack web app generation",
      status: "PLANNED",
    });

    expect(entry.version).toBe(1);
  });

  it("increments the version for the same subjectKey and getLatestTruthStatus returns the newest", async () => {
    const { owner, project } = await seedProject();

    await setTruthStatus(owner.id, project.id, {
      subjectKey: "payments.deposits",
      subjectLabel: "Deposits",
      status: "NOT_EVALUATED",
    });
    await setTruthStatus(owner.id, project.id, {
      subjectKey: "payments.deposits",
      subjectLabel: "Deposits",
      status: "PLANNED",
      rationale: "Assessed against the registry.",
    });

    const latest = await getLatestTruthStatus(owner.id, project.id, "payments.deposits");
    expect(latest?.version).toBe(2);
    expect(latest?.status).toBe("PLANNED");
  });

  it("listLatestTruthStatuses returns only the newest version per subjectKey", async () => {
    const { owner, project } = await seedProject();

    await setTruthStatus(owner.id, project.id, {
      subjectKey: "generation.full_stack_web_app",
      subjectLabel: "v1",
      status: "NOT_EVALUATED",
    });
    await setTruthStatus(owner.id, project.id, {
      subjectKey: "generation.full_stack_web_app",
      subjectLabel: "v2",
      status: "PLANNED",
    });
    await setTruthStatus(owner.id, project.id, {
      subjectKey: "payments.deposits",
      subjectLabel: "deposits",
      status: "PLANNED",
    });

    const latest = await listLatestTruthStatuses(owner.id, project.id);
    expect(latest).toHaveLength(2);
    const generation = latest.find((e) => e.subjectKey === "generation.full_stack_web_app");
    expect(generation?.subjectLabel).toBe("v2");
  });

  it("denies Truth Status access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await setTruthStatus(owner.id, project.id, {
      subjectKey: "x",
      subjectLabel: "x",
      status: "NOT_EVALUATED",
    });

    await expect(listLatestTruthStatuses(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
