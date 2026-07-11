// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  createKnowledgeEdge,
  createKnowledgeNode,
  getKnowledgeGraph,
  InvalidKnowledgeEdgeError,
  listKnowledgeNodes,
} from "./product-knowledge";

describe("Product Knowledge relationships", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedTwoProjects() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const projectA = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const projectB = await createProject({
      organizationId: org.id,
      name: "Second Project",
      createdByUserId: owner.id,
    });
    return { owner, projectA, projectB };
  }

  it("creates a Requirement node and lists it back by type", async () => {
    const { owner, projectA } = await seedTwoProjects();

    await createKnowledgeNode(owner.id, projectA.id, {
      type: "REQUIREMENT",
      label: "Customers can book a detailing appointment",
    });

    const requirements = await listKnowledgeNodes(owner.id, projectA.id, { type: "REQUIREMENT" });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.label).toBe("Customers can book a detailing appointment");
  });

  it("links a Requirement to a Workflow with a stable edge", async () => {
    const { owner, projectA } = await seedTwoProjects();

    const requirement = await createKnowledgeNode(owner.id, projectA.id, {
      type: "REQUIREMENT",
      label: "Customers can book a detailing appointment",
    });
    const workflow = await createKnowledgeNode(owner.id, projectA.id, {
      type: "WORKFLOW",
      label: "Booking flow",
    });

    const edge = await createKnowledgeEdge(owner.id, projectA.id, {
      sourceNodeId: requirement.id,
      targetNodeId: workflow.id,
    });

    const graph = await getKnowledgeGraph(owner.id, projectA.id);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toEqual([expect.objectContaining({ id: edge.id })]);
  });

  it("rejects an edge between nodes from different projects", async () => {
    const { owner, projectA, projectB } = await seedTwoProjects();

    const requirementInA = await createKnowledgeNode(owner.id, projectA.id, {
      type: "REQUIREMENT",
      label: "Requirement in project A",
    });
    const workflowInB = await createKnowledgeNode(owner.id, projectB.id, {
      type: "WORKFLOW",
      label: "Workflow in project B",
    });

    await expect(
      createKnowledgeEdge(owner.id, projectA.id, {
        sourceNodeId: requirementInA.id,
        targetNodeId: workflowInB.id,
      }),
    ).rejects.toBeInstanceOf(InvalidKnowledgeEdgeError);
  });

  it("rejects a self-loop edge", async () => {
    const { owner, projectA } = await seedTwoProjects();

    const node = await createKnowledgeNode(owner.id, projectA.id, {
      type: "REQUIREMENT",
      label: "Solo node",
    });

    await expect(
      createKnowledgeEdge(owner.id, projectA.id, {
        sourceNodeId: node.id,
        targetNodeId: node.id,
      }),
    ).rejects.toBeInstanceOf(InvalidKnowledgeEdgeError);
  });

  it("denies knowledge graph access for a non-member (tenant isolation)", async () => {
    const { projectA } = await seedTwoProjects();
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });

    await expect(
      createKnowledgeNode(outsider.id, projectA.id, { type: "REQUIREMENT", label: "hostile" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
