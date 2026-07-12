// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "./blueprint-generator";
import { createGeneratedAppUser } from "./generated-app-users";
import {
  GeneratedRecordNotFoundError,
  InvalidRecordDataError,
  UnknownDataModelError,
  createGeneratedRecord,
  deleteGeneratedRecord,
  getGeneratedRecord,
  listGeneratedRecords,
  updateGeneratedRecord,
} from "./generated-records";

describe("generated records", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithDataModel() {
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
      "Build a booking app with a database of customer records.",
    );
    const blueprint = await generateInitialBlueprint(owner.id, project.id);
    return { owner, project, blueprint };
  }

  it("rejects a record for a modelKey the current Blueprint does not define", async () => {
    const { owner, project } = await seedProjectWithDataModel();

    await expect(
      createGeneratedRecord(owner.id, project.id, {
        modelKey: "Nonexistent",
        data: { id: "1", status: "open", createdAt: "2026-01-01" },
      }),
    ).rejects.toBeInstanceOf(UnknownDataModelError);
  });

  it("rejects a record missing a required field the data model defines", async () => {
    const { owner, project } = await seedProjectWithDataModel();

    await expect(
      createGeneratedRecord(owner.id, project.id, {
        modelKey: "Record",
        data: { id: "1" },
      }),
    ).rejects.toBeInstanceOf(InvalidRecordDataError);
  });

  it("creates a record that satisfies every required field", async () => {
    const { owner, project } = await seedProjectWithDataModel();

    const record = await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    expect(record.modelKey).toBe("Record");
    expect(record.data).toMatchObject({ status: "open" });
  });

  it("associates a record with the generated-app user who owns it", async () => {
    const { owner, project } = await seedProjectWithDataModel();
    const customer = await createGeneratedAppUser(owner.id, project.id, {
      email: "customer@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });

    const record = await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
      ownerGeneratedAppUserId: customer.id,
    });

    const owned = await listGeneratedRecords(owner.id, project.id, {
      ownerGeneratedAppUserId: customer.id,
    });
    expect(owned.map((r) => r.id)).toEqual([record.id]);
  });

  it("lists records scoped to a modelKey and gets a single record by id", async () => {
    const { owner, project } = await seedProjectWithDataModel();
    const record = await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    const list = await listGeneratedRecords(owner.id, project.id, { modelKey: "Record" });
    expect(list.map((r) => r.id)).toEqual([record.id]);

    const fetched = await getGeneratedRecord(owner.id, project.id, record.id);
    expect(fetched?.id).toBe(record.id);
  });

  it("updates a record's data after re-validating it against the data model", async () => {
    const { owner, project } = await seedProjectWithDataModel();
    const record = await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    const updated = await updateGeneratedRecord(owner.id, project.id, record.id, {
      id: "1",
      status: "closed",
      createdAt: "2026-01-01",
    });

    expect(updated.data).toMatchObject({ status: "closed" });

    await expect(
      updateGeneratedRecord(owner.id, project.id, record.id, { id: "1" }),
    ).rejects.toBeInstanceOf(InvalidRecordDataError);
  });

  it("throws when updating a record that does not exist in this project", async () => {
    const { owner, project } = await seedProjectWithDataModel();

    await expect(
      updateGeneratedRecord(owner.id, project.id, "nonexistent-id", {
        id: "1",
        status: "open",
        createdAt: "2026-01-01",
      }),
    ).rejects.toBeInstanceOf(GeneratedRecordNotFoundError);
  });

  it("deletes a record", async () => {
    const { owner, project } = await seedProjectWithDataModel();
    const record = await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    await deleteGeneratedRecord(owner.id, project.id, record.id);

    expect(await getGeneratedRecord(owner.id, project.id, record.id)).toBeNull();
  });

  it("denies access for an actor without project membership", async () => {
    const { project } = await seedProjectWithDataModel();
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(
      createGeneratedRecord(outsider.id, project.id, {
        modelKey: "Record",
        data: { id: "1", status: "open", createdAt: "2026-01-01" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps records isolated between two projects with the same modelKey", async () => {
    const { owner, project: projectA } = await seedProjectWithDataModel();
    const org = await createOrganization({ name: "Second Org", ownerUserId: owner.id });
    const projectB = await createProject({
      organizationId: org.id,
      name: "Second App",
      createdByUserId: owner.id,
    });
    await generateProductIntelligence(
      owner.id,
      projectB.id,
      "Build a booking app with a database of customer records.",
    );
    await generateInitialBlueprint(owner.id, projectB.id);

    await createGeneratedRecord(owner.id, projectA.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    const listB = await listGeneratedRecords(owner.id, projectB.id, { modelKey: "Record" });
    expect(listB).toEqual([]);
  });
});
