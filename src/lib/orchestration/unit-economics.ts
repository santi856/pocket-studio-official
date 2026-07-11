export type EconomicAssumptionSource =
  "user_provided" | "estimate" | "provider_reported" | "actual_connected" | "unknown";

export type EconomicAssumption = {
  value: number | null;
  source: EconomicAssumptionSource;
};

export type UnitEconomicsAssumptions = {
  price: EconomicAssumption;
  revenuePerCustomer: EconomicAssumption;
  transactionValue: EconomicAssumption;
  transactionFrequencyPerMonth: EconomicAssumption;
  paymentFeesPercent: EconomicAssumption;
  hostingCostPerMonth: EconomicAssumption;
  aiCostPerMonth: EconomicAssumption;
  storageCostPerMonth: EconomicAssumption;
  supportCostPerMonth: EconomicAssumption;
  grossMarginPercent: EconomicAssumption;
  breakEvenCustomerCount: EconomicAssumption;
};

const UNKNOWN: EconomicAssumption = { value: null, source: "unknown" };

/**
 * Master Spec §20: "editable assumptions," each tagged with its source so
 * the UI (P1-10) can render them as customer-editable inputs rather than
 * facts. Nothing here is invented — every field the customer hasn't
 * provided and Phase 1 hasn't connected to a real provider is `unknown`,
 * except the payment-processing fee, which is a disclosed, widely-known
 * industry-typical estimate (not researched for this specific product).
 */
export function defaultUnitEconomicsAssumptions(): UnitEconomicsAssumptions {
  return {
    price: UNKNOWN,
    revenuePerCustomer: UNKNOWN,
    transactionValue: UNKNOWN,
    transactionFrequencyPerMonth: UNKNOWN,
    paymentFeesPercent: { value: 2.9, source: "estimate" },
    hostingCostPerMonth: UNKNOWN,
    aiCostPerMonth: UNKNOWN,
    storageCostPerMonth: UNKNOWN,
    supportCostPerMonth: UNKNOWN,
    grossMarginPercent: UNKNOWN,
    breakEvenCustomerCount: UNKNOWN,
  };
}
