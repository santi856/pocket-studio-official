// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedPlans } from "./seed-plans";
import { createSubscription } from "./subscription";
import {
  assertExportAllowed,
  assertWithinProjectLimit,
  ExportNotAllowedError,
  getOrganizationUsage,
  ProjectLimitExceededError,
} from "./entitlements";

describe("Organization entitlements enforcement", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedOrg() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    return { owner, org };
  }

  it("getOrganizationUsage counts this organization's real projects", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { planKey: "AGENCY" },
    });

    expect((await getOrganizationUsage(owner.id, org.id)).projectCount).toBe(0);
    await createProject({ organizationId: org.id, name: "First", createdByUserId: owner.id });
    expect((await getOrganizationUsage(owner.id, org.id)).projectCount).toBe(1);
  });

  it("Free/Explore's projectLimit (1) is enforced by assertWithinProjectLimit", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id); // FREE_EXPLORE, projectLimit: 1

    await expect(assertWithinProjectLimit(owner.id, org.id)).resolves.toBeUndefined();
    await createProject({ organizationId: org.id, name: "First", createdByUserId: owner.id });

    await expect(assertWithinProjectLimit(owner.id, org.id)).rejects.toBeInstanceOf(
      ProjectLimitExceededError,
    );
  });

  it("createProject itself enforces the limit end to end — not just the standalone assertion", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);

    await createProject({ organizationId: org.id, name: "First", createdByUserId: owner.id });

    await expect(
      createProject({ organizationId: org.id, name: "Second", createdByUserId: owner.id }),
    ).rejects.toBeInstanceOf(ProjectLimitExceededError);

    const projects = await db.project.findMany({ where: { organizationId: org.id } });
    expect(projects).toHaveLength(1);
  });

  it("a null projectLimit (Agency) never blocks project creation", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { planKey: "AGENCY" },
    });

    for (let i = 0; i < 3; i++) {
      await createProject({
        organizationId: org.id,
        name: `Project ${i}`,
        createdByUserId: owner.id,
      });
    }

    await expect(assertWithinProjectLimit(owner.id, org.id)).resolves.toBeUndefined();
  });

  it("Free/Explore's exportAllowed (false) is enforced by assertExportAllowed", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);

    await expect(assertExportAllowed(owner.id, org.id)).rejects.toBeInstanceOf(
      ExportNotAllowedError,
    );
  });

  it("Builder's exportAllowed (true) permits export", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { planKey: "BUILDER" },
    });

    await expect(assertExportAllowed(owner.id, org.id)).resolves.toBeUndefined();
  });

  it("falls back to Free/Explore entitlements when the organization has no subscription row yet", async () => {
    const { owner, org } = await seedOrg();
    // Deliberately not calling createSubscription — real product flow
    // always creates one in the same request, but service-layer callers
    // (and this test) can construct the gap directly.
    expect(
      await db.organizationSubscription.findUnique({ where: { organizationId: org.id } }),
    ).toBeNull();

    await createProject({ organizationId: org.id, name: "First", createdByUserId: owner.id });

    await expect(
      createProject({ organizationId: org.id, name: "Second", createdByUserId: owner.id }),
    ).rejects.toBeInstanceOf(ProjectLimitExceededError);
    await expect(assertExportAllowed(owner.id, org.id)).rejects.toBeInstanceOf(
      ExportNotAllowedError,
    );
  });
});

describe("Organization entitlements enforcement when the Plan Registry itself has no data", () => {
  beforeEach(async () => {
    await resetDatabase();
    // Deliberately not calling seedPlans() — this is a platform
    // configuration gap (seed data never ran in this environment), not a
    // real customer's usage exceeding a real policy. There is no policy
    // to enforce yet, so entitlement checks must fail open rather than
    // blocking every project/export operation platform-wide.
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("does not block project creation when no PlanDefinition exists at all", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);

    await expect(assertWithinProjectLimit(owner.id, org.id)).resolves.toBeUndefined();
    await expect(
      createProject({ organizationId: org.id, name: "First", createdByUserId: owner.id }),
    ).resolves.toBeDefined();
    await expect(assertExportAllowed(owner.id, org.id)).resolves.toBeUndefined();
  });
});
