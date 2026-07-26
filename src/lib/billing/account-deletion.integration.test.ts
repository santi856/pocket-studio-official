// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { seedCapabilityRegistry } from "@/lib/registry/seed-data";
import { seedPlans } from "./seed-plans";
import { createSubscription } from "./subscription";
import { upsertIntegrationRequirement } from "@/lib/product/integrations";
import { storeCredential } from "@/lib/credentials/vault";
import { generateProductIntelligence } from "@/lib/orchestration/product-intelligence";
import { generateInitialBlueprint } from "@/lib/generation/blueprint-generator";
import { createGeneratedRecord } from "@/lib/generation/generated-records";
import { signUpGeneratedAppUser } from "@/lib/generation/generated-app-auth";
import { ForbiddenError } from "@/lib/tenancy/authz";
import {
  requestAccountDeletion,
  cancelAccountDeletionRequest,
  getAccountDeletionStatus,
  executeDueAccountDeletions,
  AccountDeletionAlreadyPendingError,
  NoAccountDeletionPendingError,
} from "./account-deletion";

describe("account-deletion", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
    await seedCapabilityRegistry();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedOrgWithOwnerAndMember() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const member = await registerUser({ email: "member@example.com", password: "password123" });
    await db.membership.create({
      data: { userId: member.id, organizationId: org.id, role: "MEMBER" },
    });
    return { owner, member, org };
  }

  it("creates a pending request scheduled ~30 days out when the owner requests deletion", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();

    const before = Date.now();
    const request = await requestAccountDeletion(owner.id, org.id);
    const after = Date.now();

    expect(request.status).toBe("PENDING");
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(request.scheduledPurgeAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000);
    expect(request.scheduledPurgeAt.getTime()).toBeLessThanOrEqual(after + thirtyDaysMs + 1000);
  });

  it("rejects a non-owner member requesting deletion", async () => {
    const { member, org } = await seedOrgWithOwnerAndMember();

    await expect(requestAccountDeletion(member.id, org.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a second request while one is already pending", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();
    await requestAccountDeletion(owner.id, org.id);

    await expect(requestAccountDeletion(owner.id, org.id)).rejects.toBeInstanceOf(
      AccountDeletionAlreadyPendingError,
    );
  });

  it("allows a new request after a prior one was canceled", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();
    await requestAccountDeletion(owner.id, org.id);
    await cancelAccountDeletionRequest(owner.id, org.id);

    const second = await requestAccountDeletion(owner.id, org.id);
    expect(second.status).toBe("PENDING");
  });

  it("cancels a pending request", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();
    await requestAccountDeletion(owner.id, org.id);

    const canceled = await cancelAccountDeletionRequest(owner.id, org.id);
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.canceledAt).not.toBeNull();
  });

  it("rejects canceling when nothing is pending", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();

    await expect(cancelAccountDeletionRequest(owner.id, org.id)).rejects.toBeInstanceOf(
      NoAccountDeletionPendingError,
    );
  });

  it("rejects a non-owner member canceling deletion", async () => {
    const { owner, member, org } = await seedOrgWithOwnerAndMember();
    await requestAccountDeletion(owner.id, org.id);

    await expect(cancelAccountDeletionRequest(member.id, org.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("lets any member (not just the owner) read the pending deletion status", async () => {
    const { owner, member, org } = await seedOrgWithOwnerAndMember();
    await requestAccountDeletion(owner.id, org.id);

    const status = await getAccountDeletionStatus(member.id, org.id);
    expect(status?.status).toBe("PENDING");
  });

  it("returns null status when nothing is pending", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();

    expect(await getAccountDeletionStatus(owner.id, org.id)).toBeNull();
  });

  it("does not purge a request whose grace period has not elapsed yet", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();
    await createProject({ organizationId: org.id, name: "Booking App", createdByUserId: owner.id });
    await requestAccountDeletion(owner.id, org.id);

    const executed = await executeDueAccountDeletions();

    expect(executed).toHaveLength(0);
    expect(await db.project.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("never purges a canceled request even if its original schedule has passed", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();
    await createProject({ organizationId: org.id, name: "Booking App", createdByUserId: owner.id });
    const request = await requestAccountDeletion(owner.id, org.id);
    await cancelAccountDeletionRequest(owner.id, org.id);
    await db.accountDeletionRequest.update({
      where: { id: request.id },
      data: { scheduledPurgeAt: new Date(Date.now() - 1000) },
    });

    const executed = await executeDueAccountDeletions();

    expect(executed).toHaveLength(0);
    expect(await db.project.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("purges projects/records/credentials/generated-app-users/memberships but preserves billing history and an anonymized organization row, once due", async () => {
    const { owner, org } = await seedOrgWithOwnerAndMember();
    await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "ACTIVE" },
    });
    const subscription = await db.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: org.id },
    });
    const billingEvent = await db.billingEvent.create({
      data: {
        organizationSubscriptionId: subscription.id,
        type: "STATE_TRANSITIONED",
        summary: "Test billing history entry",
      },
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
    const appUser = await signUpGeneratedAppUser(
      project.id,
      "customer@example.com",
      "correcthorsebatterystaple",
      undefined,
    );

    const request = await requestAccountDeletion(owner.id, org.id);
    await db.accountDeletionRequest.update({
      where: { id: request.id },
      data: { scheduledPurgeAt: new Date(Date.now() - 1000) },
    });

    const executed = await executeDueAccountDeletions();

    expect(executed).toHaveLength(1);
    expect(executed[0]!.status).toBe("EXECUTED");
    expect(executed[0]!.executedAt).not.toBeNull();

    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await db.generatedRecord.findUnique({ where: { id: record.id } })).toBeNull();
    expect(
      await db.integrationRequirement.findUnique({ where: { id: requirement.id } }),
    ).toBeNull();
    expect(
      await db.credentialReference.findUnique({
        where: { integrationRequirementId: requirement.id },
      }),
    ).toBeNull();
    expect(await db.generatedAppUser.findUnique({ where: { id: appUser.id } })).toBeNull();
    expect(
      await db.membership.findUnique({
        where: { userId_organizationId: { userId: owner.id, organizationId: org.id } },
      }),
    ).toBeNull();

    // Billing/invoice history survives, per the founder's explicit decision.
    const survivingSubscription = await db.organizationSubscription.findUnique({
      where: { organizationId: org.id },
    });
    expect(survivingSubscription).not.toBeNull();
    const survivingEvent = await db.billingEvent.findUnique({ where: { id: billingEvent.id } });
    expect(survivingEvent).not.toBeNull();

    const survivingOrg = await db.organization.findUnique({ where: { id: org.id } });
    expect(survivingOrg).not.toBeNull();
    expect(survivingOrg!.name).toBe("[deleted organization]");
  });
});
