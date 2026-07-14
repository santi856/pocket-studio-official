// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { createKnowledgeNode } from "@/lib/product/product-knowledge";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  ProductKnowledgeNodeNotFoundError,
  listProductOutcomes,
  recordProductAnalyticsSnapshotAsOutcomes,
  recordProductOutcome,
} from "./product-outcomes";

describe("product outcomes", () => {
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

  describe("recordProductOutcome", () => {
    it("records a real outcome fact with no knowledge node", async () => {
      const { owner, project } = await seedProject();

      const record = await recordProductOutcome(owner.id, project.id, {
        metricKey: "booking.completion_rate",
        value: 0.72,
        source: "manual",
      });

      expect(record.metricKey).toBe("booking.completion_rate");
      expect(record.value).toBe(0.72);
      expect(record.knowledgeNodeId).toBeNull();
    });

    it("ties an outcome to a real Product Knowledge Graph node", async () => {
      const { owner, project } = await seedProject();
      const node = await createKnowledgeNode(owner.id, project.id, {
        type: "SCREEN",
        label: "Booking Confirmation",
      });

      const record = await recordProductOutcome(owner.id, project.id, {
        knowledgeNodeId: node.id,
        metricKey: "screen.view_count",
        value: 42,
        source: "manual",
      });

      expect(record.knowledgeNodeId).toBe(node.id);
    });

    it("throws ProductKnowledgeNodeNotFoundError for an unknown node", async () => {
      const { owner, project } = await seedProject();

      await expect(
        recordProductOutcome(owner.id, project.id, {
          knowledgeNodeId: "nonexistent-id",
          metricKey: "screen.view_count",
          value: 1,
          source: "manual",
        }),
      ).rejects.toBeInstanceOf(ProductKnowledgeNodeNotFoundError);
    });

    it("denies access to a non-member", async () => {
      const { outsider, project } = await seedProject();

      await expect(
        recordProductOutcome(outsider.id, project.id, {
          metricKey: "x",
          value: 1,
          source: "manual",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("listProductOutcomes", () => {
    it("lists outcomes newest first, optionally filtered by metricKey", async () => {
      const { owner, project } = await seedProject();
      await recordProductOutcome(owner.id, project.id, {
        metricKey: "a",
        value: 1,
        source: "manual",
      });
      await recordProductOutcome(owner.id, project.id, {
        metricKey: "b",
        value: 2,
        source: "manual",
      });

      const all = await listProductOutcomes(owner.id, project.id);
      expect(all).toHaveLength(2);

      const filtered = await listProductOutcomes(owner.id, project.id, { metricKey: "a" });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.metricKey).toBe("a");
    });
  });

  describe("recordProductAnalyticsSnapshotAsOutcomes", () => {
    it("records real analytics facts as a queryable historical record", async () => {
      const { owner, project } = await seedProject();
      await db.generatedAppUser.create({
        data: {
          projectId: project.id,
          email: "a@example.com",
          passwordHash: "x",
          role: "customer",
        },
      });

      const facts = await recordProductAnalyticsSnapshotAsOutcomes(owner.id, project.id);

      const userCountFact = facts.find((f) => f.metricKey === "generatedAppUserCount");
      expect(userCountFact?.value).toBe(1);
      expect(userCountFact?.source).toBe("product-analytics-snapshot");

      const stored = await listProductOutcomes(owner.id, project.id);
      expect(stored.length).toBe(facts.length);
    });

    it("accumulates a real time series across repeated calls", async () => {
      const { owner, project } = await seedProject();

      await recordProductAnalyticsSnapshotAsOutcomes(owner.id, project.id);
      await db.generatedAppUser.create({
        data: {
          projectId: project.id,
          email: "a@example.com",
          passwordHash: "x",
          role: "customer",
        },
      });
      await recordProductAnalyticsSnapshotAsOutcomes(owner.id, project.id);

      const history = await listProductOutcomes(owner.id, project.id, {
        metricKey: "generatedAppUserCount",
      });
      expect(history).toHaveLength(2);
      expect(history.map((r) => r.value).sort()).toEqual([0, 1]);
    });
  });
});
