import { describe, expect, it } from "vitest";
import { defaultUnitEconomicsAssumptions } from "./unit-economics";

describe("defaultUnitEconomicsAssumptions", () => {
  it("marks price and revenue fields as unknown, never invents a value", () => {
    const assumptions = defaultUnitEconomicsAssumptions();
    expect(assumptions.price).toEqual({ value: null, source: "unknown" });
    expect(assumptions.revenuePerCustomer).toEqual({ value: null, source: "unknown" });
    expect(assumptions.breakEvenCustomerCount).toEqual({ value: null, source: "unknown" });
  });

  it("labels the payment-fee default explicitly as an estimate, not a fact", () => {
    const assumptions = defaultUnitEconomicsAssumptions();
    expect(assumptions.paymentFeesPercent.source).toBe("estimate");
    expect(assumptions.paymentFeesPercent.value).not.toBeNull();
  });

  it("never marks any field as provider_reported or actual_connected in Phase 1", () => {
    const assumptions = defaultUnitEconomicsAssumptions();
    const sources = Object.values(assumptions).map((a) => a.source);
    expect(sources).not.toContain("provider_reported");
    expect(sources).not.toContain("actual_connected");
  });
});
