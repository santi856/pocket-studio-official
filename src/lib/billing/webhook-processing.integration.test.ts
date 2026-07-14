// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { seedPlans } from "./seed-plans";
import { createSubscription, getSubscription, linkBillingProviderCustomer } from "./subscription";
import { processBillingWebhook, UnrecognizedWebhookOrganizationError } from "./webhook-processing";

describe("processBillingWebhook", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedLinkedOrg(customerId: string) {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);
    // A real PAYMENT_FAILED transition is only valid from ACTIVE
    // (src/lib/billing/access.ts) — createSubscription starts at
    // TRIALING, so this simulates an org whose trial has already
    // converted to a real paid subscription.
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "ACTIVE" },
    });
    await linkBillingProviderCustomer(owner.id, org.id, customerId);
    return { owner, org };
  }

  function eventBody(id: string, type: string, customerId: string) {
    return JSON.stringify({ id, type, data: { object: { customer: customerId } } });
  }

  it("applies a real billing state transition for a mapped, correctly-signed event", async () => {
    const { owner, org } = await seedLinkedOrg("cus_active_1");

    const result = await processBillingWebhook(
      eventBody("evt_1", "invoice.payment_failed", "cus_active_1"),
      "mock-signature",
    );

    expect(result).toEqual({ status: "processed", event: "PAYMENT_FAILED" });
    const subscription = await getSubscription(owner.id, org.id);
    expect(subscription?.billingState).toBe("PAST_DUE");
  });

  it("is idempotent — the same event id processed twice only transitions state once", async () => {
    const { owner, org } = await seedLinkedOrg("cus_active_2");
    const body = eventBody("evt_dup", "invoice.payment_failed", "cus_active_2");

    const first = await processBillingWebhook(body, "mock-signature");
    const second = await processBillingWebhook(body, "mock-signature");

    expect(first).toEqual({ status: "processed", event: "PAYMENT_FAILED" });
    expect(second).toEqual({ status: "duplicate_ignored" });
    const subscription = await getSubscription(owner.id, org.id);
    expect(subscription?.billingState).toBe("PAST_DUE");
  });

  it("ignores an event type this codebase's state machine does not model, without erroring", async () => {
    const { owner, org } = await seedLinkedOrg("cus_active_3");

    const result = await processBillingWebhook(
      eventBody("evt_2", "customer.updated", "cus_active_3"),
      "mock-signature",
    );

    expect(result).toEqual({
      status: "ignored_unmapped_event_type",
      providerEventType: "customer.updated",
    });
    const subscription = await getSubscription(owner.id, org.id);
    expect(subscription?.billingState).toBe("ACTIVE");
  });

  it("throws UnrecognizedWebhookOrganizationError for a customer id no organization is linked to", async () => {
    await expect(
      processBillingWebhook(
        eventBody("evt_3", "invoice.payment_failed", "cus_never_linked"),
        "mock-signature",
      ),
    ).rejects.toBeInstanceOf(UnrecognizedWebhookOrganizationError);
  });

  it("records the processed event for idempotency even across a fresh request", async () => {
    await seedLinkedOrg("cus_active_4");
    const body = eventBody("evt_recorded", "invoice.payment_failed", "cus_active_4");

    await processBillingWebhook(body, "mock-signature");

    const recorded = await db.processedWebhookEvent.findUnique({
      where: { provider_providerEventId: { provider: "mock", providerEventId: "evt_recorded" } },
    });
    expect(recorded).not.toBeNull();
  });

  describe("invoice.payment_succeeded against an already-healthy subscription (Level 3 review round 1, DEFECT 1)", () => {
    it("does not crash on the ordinary renewal of an ACTIVE subscription — a real no-op, not an error", async () => {
      const { owner, org } = await seedLinkedOrg("cus_renewal_1");
      const before = await db.billingEvent.count();

      const result = await processBillingWebhook(
        eventBody("evt_renewal_1", "invoice.payment_succeeded", "cus_renewal_1"),
        "mock-signature",
      );

      expect(result).toEqual({ status: "processed", event: "PAYMENT_RECOVERED" });
      const subscription = await getSubscription(owner.id, org.id);
      expect(subscription?.billingState).toBe("ACTIVE");
      // No new BillingEvent transition was recorded for the no-op.
      expect(await db.billingEvent.count()).toBe(before);
    });

    it("still permits a genuine payment recovery from a failure-adjacent state", async () => {
      const { owner, org } = await seedLinkedOrg("cus_recovery_1");
      await db.organizationSubscription.update({
        where: { organizationId: org.id },
        data: { billingState: "PAST_DUE" },
      });

      const result = await processBillingWebhook(
        eventBody("evt_recovery_1", "invoice.payment_succeeded", "cus_recovery_1"),
        "mock-signature",
      );

      expect(result).toEqual({ status: "processed", event: "PAYMENT_RECOVERED" });
      const subscription = await getSubscription(owner.id, org.id);
      expect(subscription?.billingState).toBe("ACTIVE");
    });

    it("the idempotency check still recognizes a redelivery of the same no-op event", async () => {
      await seedLinkedOrg("cus_renewal_2");
      const body = eventBody("evt_renewal_2", "invoice.payment_succeeded", "cus_renewal_2");

      const first = await processBillingWebhook(body, "mock-signature");
      const second = await processBillingWebhook(body, "mock-signature");

      expect(first).toEqual({ status: "processed", event: "PAYMENT_RECOVERED" });
      expect(second).toEqual({ status: "duplicate_ignored" });
    });
  });
});
