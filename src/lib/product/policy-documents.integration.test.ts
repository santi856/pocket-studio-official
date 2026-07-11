// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  createPolicyDocumentDraft,
  getLatestPolicyDocument,
  listPolicyDocuments,
} from "./policy-documents";

describe("Policy Documents", () => {
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

  it("creates version 1 as a DRAFT", async () => {
    const { owner, project } = await seedProject();

    const doc = await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "Draft privacy policy content.",
    });

    expect(doc.version).toBe(1);
    expect(doc.status).toBe("DRAFT");
    expect(doc.language).toBe("en");
  });

  it("increments the version for the same type and language", async () => {
    const { owner, project } = await seedProject();

    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "v1",
    });
    const v2 = await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "v2",
    });

    expect(v2.version).toBe(2);
    const latest = await getLatestPolicyDocument(owner.id, project.id, "PRIVACY_POLICY");
    expect(latest?.content).toBe("v2");
  });

  it("versions independently per language", async () => {
    const { owner, project } = await seedProject();

    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "English v1",
      language: "en",
    });
    const spanishV1 = await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "Spanish v1",
      language: "es",
    });

    expect(spanishV1.version).toBe(1);
  });

  it("versions independently per document type", async () => {
    const { owner, project } = await seedProject();

    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "privacy",
    });
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "TERMS_OF_SERVICE",
      content: "terms",
    });

    const all = await listPolicyDocuments(owner.id, project.id);
    expect(all).toHaveLength(2);
  });

  it("denies policy document access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, project } = await seedProject();
    await createPolicyDocumentDraft(owner.id, project.id, {
      type: "PRIVACY_POLICY",
      content: "x",
    });

    await expect(listPolicyDocuments(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
