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

  async function seedUnlinkedOrg() {
    const owner = await registerUser({
      email: "checkout-owner@example.com",
      password: "password123",
    });
    const org = await createOrganization({ name: "Fresh Checkout Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);
    return { owner, org };
  }

  function checkoutCompletedBody(
    id: string,
    customerId: string,
    subscriptionId: string,
    clientReferenceId: string,
  ) {
    return JSON.stringify({
      id,
      type: "checkout.session.completed",
      data: {
        object: {
          customer: customerId,
          subscription: subscriptionId,
          client_reference_id: clientReferenceId,
        },
      },
    });
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

  describe("checkout.session.completed — real Stripe Checkout flow", () => {
    it("resolves a brand-new checkout via client_reference_id, links the provider customer, and activates the subscription", async () => {
      const { owner, org } = await seedUnlinkedOrg();
      const before = await getSubscription(owner.id, org.id);
      expect(before?.billingState).toBe("TRIALING");
      expect(before?.billingProviderCustomerId).toBeNull();

      const result = await processBillingWebhook(
        checkoutCompletedBody("evt_checkout_1", "cus_new_1", "sub_new_1", org.id),
        "mock-signature",
      );

      expect(result).toEqual({ status: "processed", event: "CHECKOUT_COMPLETED" });
      const after = await getSubscription(owner.id, org.id);
      expect(after?.billingState).toBe("ACTIVE");
      expect(after?.billingProviderCustomerId).toBe("cus_new_1");
      expect(after?.billingProviderSubscriptionId).toBe("sub_new_1");
    });

    it("is idempotent — a redelivered checkout.session.completed does not double-apply", async () => {
      const { owner, org } = await seedUnlinkedOrg();
      const body = checkoutCompletedBody("evt_checkout_dup", "cus_new_2", "sub_new_2", org.id);

      const first = await processBillingWebhook(body, "mock-signature");
      const second = await processBillingWebhook(body, "mock-signature");

      expect(first).toEqual({ status: "processed", event: "CHECKOUT_COMPLETED" });
      expect(second).toEqual({ status: "duplicate_ignored" });
      const subscription = await getSubscription(owner.id, org.id);
      expect(subscription?.billingState).toBe("ACTIVE");
    });

    it("treats a re-delivered or re-visited checkout for an already-ACTIVE organization as a real, recorded no-op — not an error", async () => {
      const { owner, org } = await seedLinkedOrg("cus_already_active");

      const result = await processBillingWebhook(
        checkoutCompletedBody("evt_checkout_noop", "cus_already_active", "sub_noop", org.id),
        "mock-signature",
      );

      expect(result).toEqual({ status: "processed", event: "CHECKOUT_COMPLETED" });
      const subscription = await getSubscription(owner.id, org.id);
      expect(subscription?.billingState).toBe("ACTIVE");
      const recorded = await db.processedWebhookEvent.findUnique({
        where: {
          provider_providerEventId: { provider: "mock", providerEventId: "evt_checkout_noop" },
        },
      });
      expect(recorded).not.toBeNull();
    });

    it("raises the same UnrecognizedWebhookOrganizationError (handled gracefully by the route) when client_reference_id matches no real organization, instead of an uncaught SubscriptionNotFoundError", async () => {
      await expect(
        processBillingWebhook(
          checkoutCompletedBody(
            "evt_checkout_garbage",
            "cus_garbage",
            "sub_garbage",
            "org_never_existed",
          ),
          "mock-signature",
        ),
      ).rejects.toBeInstanceOf(UnrecognizedWebhookOrganizationError);
    });

    it("re-activates a canceled organization that checks out again", async () => {
      const { owner, org } = await seedUnlinkedOrg();
      await db.organizationSubscription.update({
        where: { organizationId: org.id },
        data: { billingState: "CANCELED" },
      });

      const result = await processBillingWebhook(
        checkoutCompletedBody("evt_checkout_resub", "cus_resub_1", "sub_resub_1", org.id),
        "mock-signature",
      );

      expect(result).toEqual({ status: "processed", event: "CHECKOUT_COMPLETED" });
      const subscription = await getSubscription(owner.id, org.id);
      expect(subscription?.billingState).toBe("ACTIVE");
    });
  });
});
