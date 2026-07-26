import { describe, expect, it } from "vitest";
import {
  getAccessLevel,
  getPreservedCapabilities,
  InvalidBillingTransitionError,
  nextBillingState,
} from "./access";

describe("getAccessLevel", () => {
  it("grants full access during trialing, active, and the entire dunning sequence up to grace period", () => {
    expect(getAccessLevel("TRIALING")).toBe("full");
    expect(getAccessLevel("ACTIVE")).toBe("full");
    expect(getAccessLevel("PAST_DUE")).toBe("full");
    expect(getAccessLevel("PAYMENT_RETRYING")).toBe("full");
    expect(getAccessLevel("GRACE_PERIOD")).toBe("full");
  });

  it("restricts access once grace period is exhausted, through cancellation and retention", () => {
    expect(getAccessLevel("RESTRICTED")).toBe("restricted");
    expect(getAccessLevel("SUSPENDED")).toBe("restricted");
    expect(getAccessLevel("CANCELED")).toBe("restricted");
    expect(getAccessLevel("EXPIRED")).toBe("restricted");
    expect(getAccessLevel("RETENTION_PERIOD")).toBe("restricted");
    expect(getAccessLevel("DELETION_SCHEDULED")).toBe("restricted");
  });

  it("has no access only once actually deleted", () => {
    expect(getAccessLevel("DELETED")).toBe("none");
  });
});

describe("getPreservedCapabilities", () => {
  it("preserves login, billing access, payment updates, read-only projects, export, support, and cancellation while restricted", () => {
    const preserved = getPreservedCapabilities("RESTRICTED");
    expect(preserved).toEqual([
      "login",
      "billing_access",
      "payment_updates",
      "read_only_projects",
      "portability_export",
      "support",
      "cancellation",
    ]);
  });

  it("returns 'all' for full access", () => {
    expect(getPreservedCapabilities("ACTIVE")).toBe("all");
  });

  it("returns an empty list once deleted", () => {
    expect(getPreservedCapabilities("DELETED")).toEqual([]);
  });
});

describe("nextBillingState", () => {
  it("walks the full failed-payment workflow in order", () => {
    let state = nextBillingState("ACTIVE", "PAYMENT_FAILED");
    expect(state).toBe("PAST_DUE");

    state = nextBillingState(state, "PAYMENT_RETRY_EXHAUSTED");
    expect(state).toBe("PAYMENT_RETRYING");

    state = nextBillingState(state, "PAYMENT_RETRY_EXHAUSTED");
    expect(state).toBe("GRACE_PERIOD");

    state = nextBillingState(state, "GRACE_PERIOD_EXPIRED");
    expect(state).toBe("RESTRICTED");

    state = nextBillingState(state, "RESTRICTION_ESCALATED");
    expect(state).toBe("SUSPENDED");

    state = nextBillingState(state, "PAYMENT_RECOVERED");
    expect(state).toBe("ACTIVE");
  });

  it("allows cancellation from an active or restricted state", () => {
    expect(nextBillingState("ACTIVE", "CANCEL_REQUESTED")).toBe("CANCELED");
    expect(nextBillingState("RESTRICTED", "CANCEL_REQUESTED")).toBe("CANCELED");
  });

  it("moves through retention to deletion only via the explicit lifecycle", () => {
    const retention = nextBillingState("CANCELED", "RETENTION_PERIOD_EXPIRED");
    expect(retention).toBe("RETENTION_PERIOD");
    expect(nextBillingState(retention, "DELETION_EXECUTED")).toBe("DELETED");
  });

  it("activates a brand-new subscription on its first real Stripe Checkout completion", () => {
    expect(nextBillingState("TRIALING", "CHECKOUT_COMPLETED")).toBe("ACTIVE");
  });

  it("re-activates a canceled organization that checks out again", () => {
    expect(nextBillingState("CANCELED", "CHECKOUT_COMPLETED")).toBe("ACTIVE");
  });

  it("rejects CHECKOUT_COMPLETED from a state that already has an active subscription", () => {
    expect(() => nextBillingState("ACTIVE", "CHECKOUT_COMPLETED")).toThrow(
      InvalidBillingTransitionError,
    );
  });

  it("rejects an invalid transition instead of guessing a state", () => {
    expect(() => nextBillingState("ACTIVE", "DELETION_EXECUTED")).toThrow(
      InvalidBillingTransitionError,
    );
    expect(() => nextBillingState("DELETED", "PAYMENT_RECOVERED")).toThrow(
      InvalidBillingTransitionError,
    );
  });
});
