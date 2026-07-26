// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "./blueprint-generator";
import { generateBuildPlan } from "./build-planner";
import { signUpGeneratedAppUser } from "./generated-app-auth";
import { createGeneratedAppSession } from "./generated-app-session";
import { NoBuildPlanError, ScreenHasNoDataDependencyError } from "./render-runtime";
import { InvalidRecordDataError } from "./generated-records";
import { loadScreenDataForAppUser, submitScreenRecordForAppUser } from "./generated-app-data";

describe("generated-app-data", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithSignedInAppUser() {
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
    await generateInitialBlueprint(owner.id, project.id);
    await generateBuildPlan(owner.id, project.id);

    const appUser = await signUpGeneratedAppUser(
      project.id,
      "customer@example.com",
      "correcthorsebatterystaple",
      "Customer One",
    );
    const { token } = await createGeneratedAppSession(appUser.id);

    return { owner, project, appUser, token };
  }

  it("throws NoBuildPlanError when the project has no Build Plan yet", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const appUser = await signUpGeneratedAppUser(
      project.id,
      "customer@example.com",
      "correcthorsebatterystaple",
      undefined,
    );
    const { token } = await createGeneratedAppSession(appUser.id);

    await expect(loadScreenDataForAppUser(token, project.id, "Home")).rejects.toBeInstanceOf(
      NoBuildPlanError,
    );
  });

  it("returns an empty state for a data-dependent screen with no records yet", async () => {
    const { project, token } = await seedProjectWithSignedInAppUser();

    const { screenData } = await loadScreenDataForAppUser(token, project.id, "Home");

    expect(screenData).toMatchObject({ status: "empty", modelKey: "Record" });
  });

  it("only returns records owned by the requesting GeneratedAppUser, not another customer's", async () => {
    const { project, token, appUser } = await seedProjectWithSignedInAppUser();

    const otherAppUser = await signUpGeneratedAppUser(
      project.id,
      "other-customer@example.com",
      "correcthorsebatterystaple",
      undefined,
    );
    const { token: otherToken } = await createGeneratedAppSession(otherAppUser.id);

    await submitScreenRecordForAppUser(otherToken, project.id, "Home", {
      id: "other-1",
      status: "open",
      createdAt: "2026-01-01",
    });

    const { screenData } = await loadScreenDataForAppUser(token, project.id, "Home");
    expect(screenData).toMatchObject({ status: "empty", modelKey: "Record" });

    await submitScreenRecordForAppUser(token, project.id, "Home", {
      id: "mine-1",
      status: "open",
      createdAt: "2026-01-01",
    });
    const { screenData: mine } = await loadScreenDataForAppUser(token, project.id, "Home");
    expect(mine.status).toBe("success");
    if (mine.status === "success") {
      expect(mine.records).toHaveLength(1);
      expect(mine.records[0]!.ownerGeneratedAppUserId).toBe(appUser.id);
    }
  });

  it("submits a real record scoped to the authenticated GeneratedAppUser", async () => {
    const { project, token, appUser } = await seedProjectWithSignedInAppUser();

    const record = await submitScreenRecordForAppUser(token, project.id, "Home", {
      id: "1",
      status: "open",
      createdAt: "2026-01-01",
    });

    expect(record.modelKey).toBe("Record");
    expect(record.ownerGeneratedAppUserId).toBe(appUser.id);
  });

  it("throws ScreenHasNoDataDependencyError when submitting to a screen with no data dependency", async () => {
    const { project, token } = await seedProjectWithSignedInAppUser();

    await expect(
      submitScreenRecordForAppUser(token, project.id, "Nonexistent", { id: "1" }),
    ).rejects.toBeInstanceOf(ScreenHasNoDataDependencyError);
  });

  it("throws InvalidRecordDataError when required fields are missing", async () => {
    const { project, token } = await seedProjectWithSignedInAppUser();

    await expect(
      submitScreenRecordForAppUser(token, project.id, "Home", { id: "1" }),
    ).rejects.toBeInstanceOf(InvalidRecordDataError);
  });

  it("rejects a session token from a different project", async () => {
    const { project, owner } = await seedProjectWithSignedInAppUser();
    const org = await createOrganization({ name: "Second Org", ownerUserId: owner.id });
    const otherProject = await createProject({
      organizationId: org.id,
      name: "Second App",
      createdByUserId: owner.id,
    });
    const otherAppUser = await signUpGeneratedAppUser(
      otherProject.id,
      "customer@example.com",
      "correcthorsebatterystaple",
      undefined,
    );
    const { token: otherToken } = await createGeneratedAppSession(otherAppUser.id);

    await expect(loadScreenDataForAppUser(otherToken, project.id, "Home")).rejects.toThrow();
  });
});
