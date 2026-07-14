// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { seedPlans } from "./seed-plans";
import { createSubscription, linkBillingProviderCustomer } from "./subscription";

const REAL_ENV = { ...process.env };

function setStripeEnv() {
  process.env = {
    ...REAL_ENV,
    BILLING_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_test_reconciliation",
    STRIPE_WEBHOOK_SECRET: "whsec_test_reconciliation",
  };
}

function mockStripeSubscriptionStatus(status: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status }),
      text: async () => "",
    } as Response),
  );
}

describe("reconcileSubscriptionWithProvider", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPlans();
  });

  afterEach(() => {
    process.env = { ...REAL_ENV };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedLinkedOrg() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);
    await db.organizationSubscription.update({
      where: { organizationId: org.id },
      data: { billingState: "ACTIVE" },
    });
    await linkBillingProviderCustomer(owner.id, org.id, "cus_recon", "sub_recon");
    return { owner, outsider, org };
  }

  it("reports not_linked when no billing-provider subscription id is attached", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    await createSubscription(owner.id, org.id);

    const { reconcileSubscriptionWithProvider } = await import("./reconciliation");
    const result = await reconcileSubscriptionWithProvider(owner.id, org.id);

    expect(result).toEqual({ status: "not_linked" });
  });

  it("reports in_sync when the provider's real status matches the local record", async () => {
    const { owner, org } = await seedLinkedOrg();
    setStripeEnv();
    mockStripeSubscriptionStatus("active");
    vi.resetModules();

    const { reconcileSubscriptionWithProvider } = await import("./reconciliation");
    const result = await reconcileSubscriptionWithProvider(owner.id, org.id);

    expect(result).toEqual({ status: "in_sync", providerStatus: "active", localState: "ACTIVE" });
  });

  it("detects drift and records a BillingEvent, without silently correcting the local state", async () => {
    const { owner, org } = await seedLinkedOrg();
    setStripeEnv();
    mockStripeSubscriptionStatus("canceled"); // provider says canceled, local still says ACTIVE
    vi.resetModules();

    const { reconcileSubscriptionWithProvider } = await import("./reconciliation");
    const result = await reconcileSubscriptionWithProvider(owner.id, org.id);

    expect(result).toEqual({
      status: "drift_detected",
      providerStatus: "canceled",
      localState: "ACTIVE",
    });

    const subscription = await db.organizationSubscription.findUnique({
      where: { organizationId: org.id },
    });
    expect(subscription?.billingState).toBe("ACTIVE"); // unchanged — not auto-corrected

    const events = await db.billingEvent.findMany({
      where: { organizationSubscriptionId: subscription!.id },
      orderBy: { createdAt: "desc" },
    });
    expect(events[0]?.summary).toContain("Reconciliation detected drift");
  });

  it("denies reconciliation for a non-member (tenant isolation)", async () => {
    const { outsider, org } = await seedLinkedOrg();

    // Dynamically imported from the same (possibly reset-by-a-prior-test)
    // module registry as reconcileSubscriptionWithProvider itself — a
    // statically-imported ForbiddenError from a different module instance
    // fails `instanceof` even though it is the "same" error semantically.
    const { reconcileSubscriptionWithProvider } = await import("./reconciliation");
    const { ForbiddenError: FreshForbiddenError } = await import("@/lib/tenancy/authz");
    await expect(reconcileSubscriptionWithProvider(outsider.id, org.id)).rejects.toBeInstanceOf(
      FreshForbiddenError,
    );
  });
});
