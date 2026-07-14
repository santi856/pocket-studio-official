// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { seedPlans } from "./seed-plans";
import { createSubscription, transitionBillingState } from "./subscription";
import { upsertIntegrationRequirement } from "@/lib/product/integrations";
import { storeCredential } from "@/lib/credentials/vault";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "@/lib/generation/blueprint-generator";
import { createGeneratedRecord } from "@/lib/generation/generated-records";

/**
 * Master Spec §62: "Pocket Studio nonpayment must not automatically
 * disable or delete customer-owned repositories, hosting, databases,
 * domains, Stripe accounts, Apple or Google accounts, customer APIs, or
 * live customer-owned applications." This project's own equivalent of
 * that customer-owned data (project content, integration credentials,
 * generated records) must survive the ENTIRE billing lifecycle,
 * including the real path all the way to DELETED — the billing state
 * machine (src/lib/billing/access.ts) only ever mutates
 * OrganizationSubscription/BillingEvent rows; nothing in that code path
 * touches Project or anything scoped to it. This test proves that
 * invariant directly, end to end, rather than trusting it by code
 * inspection alone.
 */
describe("customer-owned data survives the full billing lifecycle, including deletion", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  it("leaves Project, IntegrationRequirement, CredentialReference, and GeneratedRecord completely untouched through CANCELED -> RETENTION_PERIOD -> DELETED", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "ACTIVE" },
    });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const requirement = await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "CONNECTED",
    });
    await storeCredential(owner.id, project.id, {
      integrationRequirementId: requirement.id,
      provider: "stripe",
      secret: "sk_test_customer_owned_secret",
    });
    await generateProductIntelligence(
      owner.id,
      project.id,
      "Build a booking app with a database of customer records.",
    );
    await generateInitialBlueprint(owner.id, project.id);
    const record = await createGeneratedRecord(owner.id, project.id, {
      modelKey: "Record",
      data: { id: "1", status: "open", createdAt: "2026-01-01" },
    });

    const before = {
      project: await db.project.findUniqueOrThrow({ where: { id: project.id } }),
      requirement: await db.integrationRequirement.findUniqueOrThrow({
        where: { id: requirement.id },
      }),
      credential: await db.credentialReference.findUniqueOrThrow({
        where: { integrationRequirementId: requirement.id },
      }),
      record: await db.generatedRecord.findUniqueOrThrow({ where: { id: record.id } }),
    };

    // The real, valid customer-cancellation-to-deletion path
    // (src/lib/billing/access.ts's nextBillingState).
    await transitionBillingState(owner.id, org.id, "CANCEL_REQUESTED");
    await transitionBillingState(owner.id, org.id, "RETENTION_PERIOD_EXPIRED");
    const finalSubscription = await transitionBillingState(owner.id, org.id, "DELETION_EXECUTED");
    expect(finalSubscription.billingState).toBe("DELETED");

    const after = {
      project: await db.project.findUnique({ where: { id: project.id } }),
      requirement: await db.integrationRequirement.findUnique({ where: { id: requirement.id } }),
      credential: await db.credentialReference.findUnique({
        where: { integrationRequirementId: requirement.id },
      }),
      record: await db.generatedRecord.findUnique({ where: { id: record.id } }),
    };

    expect(after.project).toEqual(before.project);
    expect(after.requirement).toEqual(before.requirement);
    expect(after.credential).toEqual(before.credential);
    expect(after.record).toEqual(before.record);

    // The credential's own ciphertext is unchanged byte-for-byte — proves
    // this isn't just "a row with the same id still exists," the actual
    // encrypted secret was never touched.
    expect(after.credential?.ciphertext).toBe(before.credential.ciphertext);
  });
});
