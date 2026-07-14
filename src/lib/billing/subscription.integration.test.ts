// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { seedPlans } from "./seed-plans";
import {
  applyBillingLifecycleEventFromWebhook,
  createSubscription,
  findOrganizationIdByBillingProviderCustomerId,
  getEntitlements,
  getSubscription,
  linkBillingProviderCustomer,
  SubscriptionAlreadyExistsError,
  SubscriptionNotFoundError,
  transitionBillingState,
} from "./subscription";

describe("Organization billing subscription", () => {
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
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    return { owner, outsider, org };
  }

  it("creates a Free/Explore trialing subscription and records a SUBSCRIPTION_CREATED event", async () => {
    const { owner, org } = await seedOrg();

    const subscription = await createSubscription(owner.id, org.id);
    expect(subscription.planKey).toBe("FREE_EXPLORE");
    expect(subscription.billingState).toBe("TRIALING");

    const events = await db.billingEvent.findMany({
      where: { organizationSubscriptionId: subscription.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("SUBSCRIPTION_CREATED");
  });

  it("refuses to create a second subscription for the same organization", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);

    await expect(createSubscription(owner.id, org.id)).rejects.toBeInstanceOf(
      SubscriptionAlreadyExistsError,
    );
  });

  it("transitions billing state through the deterministic machine and records each transition", async () => {
    const { owner, org } = await seedOrg();
    const subscription = await createSubscription(owner.id, org.id);
    await transitionBillingState(owner.id, org.id, "CANCEL_REQUESTED");

    const current = await getSubscription(owner.id, org.id);
    expect(current?.billingState).toBe("CANCELED");

    const events = await db.billingEvent.findMany({
      where: { organizationSubscriptionId: subscription.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[1]?.fromState).toBe("TRIALING");
    expect(events[1]?.toState).toBe("CANCELED");
  });

  it("rejects transitioning a subscription that does not exist", async () => {
    const { owner, org } = await seedOrg();

    await expect(
      transitionBillingState(owner.id, org.id, "CANCEL_REQUESTED"),
    ).rejects.toBeInstanceOf(SubscriptionNotFoundError);
  });

  it("records a real audit log entry capturing which member triggered the transition (P3-11)", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);
    await transitionBillingState(owner.id, org.id, "CANCEL_REQUESTED");

    const entries = await db.auditLogEntry.findMany({
      where: { organizationId: org.id, action: "BILLING_STATE_TRANSITIONED" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorUserId).toBe(owner.id);
  });

  it("resolves entitlements from the plan the organization is actually subscribed to", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);

    const { planKey, entitlements } = await getEntitlements(owner.id, org.id);
    expect(planKey).toBe("FREE_EXPLORE");
    expect(entitlements).toMatchObject({ projectLimit: 1, exportAllowed: false });
  });

  it("denies subscription access for a non-member (tenant isolation)", async () => {
    const { owner, outsider, org } = await seedOrg();
    await createSubscription(owner.id, org.id);

    await expect(getSubscription(outsider.id, org.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("links a billing-provider customer id and resolves it back to the organization", async () => {
    const { owner, org } = await seedOrg();
    await createSubscription(owner.id, org.id);

    const updated = await linkBillingProviderCustomer(owner.id, org.id, "cus_real_123");
    expect(updated.billingProviderCustomerId).toBe("cus_real_123");

    const resolved = await findOrganizationIdByBillingProviderCustomerId("cus_real_123");
    expect(resolved).toBe(org.id);
  });

  it("returns null resolving a billing-provider customer id no organization is linked to", async () => {
    expect(await findOrganizationIdByBillingProviderCustomerId("cus_unknown")).toBeNull();
  });

  it("denies linking a billing-provider customer for a non-member (tenant isolation)", async () => {
    const { owner, outsider, org } = await seedOrg();
    await createSubscription(owner.id, org.id);

    await expect(
      linkBillingProviderCustomer(outsider.id, org.id, "cus_forged"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("applyBillingLifecycleEventFromWebhook applies the same real transition as transitionBillingState, with no actor", async () => {
    const { owner, org } = await seedOrg();
    const subscription = await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { id: subscription.id },
      data: { billingState: "ACTIVE" },
    });

    const updated = await applyBillingLifecycleEventFromWebhook(org.id, "PAYMENT_FAILED");

    expect(updated.billingState).toBe("PAST_DUE");
    const events = await db.billingEvent.findMany({
      where: { organizationSubscriptionId: subscription.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events[events.length - 1]?.type).toBe("PAYMENT_FAILED");
  });
});
