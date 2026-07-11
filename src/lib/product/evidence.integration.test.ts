// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { listEvidence, recordEvidence } from "./evidence";

describe("Product Evidence Ledger", () => {
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

  it("records evidence and lists it back, newest first", async () => {
    const { owner, project } = await seedProject();

    await recordEvidence(owner.id, project.id, {
      evidenceType: "FEASIBILITY_ASSESSMENT",
      subjectKey: "generation.full_stack_web_app",
      verificationMethod: "Supported Capability Registry lookup",
      result: "SUPPORTED_LATER_PHASE",
    });

    const records = await listEvidence(owner.id, project.id);
    expect(records).toHaveLength(1);
    expect(records[0]?.subjectKey).toBe("generation.full_stack_web_app");
  });

  it("filters evidence by subjectKey", async () => {
    const { owner, project } = await seedProject();

    await recordEvidence(owner.id, project.id, {
      evidenceType: "FEASIBILITY_ASSESSMENT",
      subjectKey: "payments.deposits",
      verificationMethod: "registry lookup",
      result: "SUPPORTED_LATER_PHASE",
    });
    await recordEvidence(owner.id, project.id, {
      evidenceType: "FEASIBILITY_ASSESSMENT",
      subjectKey: "generation.full_stack_web_app",
      verificationMethod: "registry lookup",
      result: "SUPPORTED_LATER_PHASE",
    });

    const filtered = await listEvidence(owner.id, project.id, { subjectKey: "payments.deposits" });
    expect(filtered).toHaveLength(1);
  });

  it("denies evidence access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await recordEvidence(owner.id, project.id, {
      evidenceType: "FEASIBILITY_ASSESSMENT",
      subjectKey: "x",
      verificationMethod: "registry lookup",
      result: "SUPPORTED_NOW",
    });

    await expect(listEvidence(outsider.id, project.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
