import type { DerivedRequirement } from "@/lib/orchestration/requirements-engine";
import { extractTargetCustomer } from "@/lib/orchestration/requirements-engine";

export type MonetizationOption = {
  option: string;
  tradeoff: string;
};

export type BusinessModelBrief = {
  targetCustomer: string;
  problem: string;
  offer: string;
  valueProposition: string;
  revenueModel: string;
  pricingAssumptions: string;
  customerAcquisitionAssumptions: string;
  activationEvent: string;
  retentionMechanisms: string;
  supportBurden: "low" | "medium" | "high";
  operationalComplexity: "low" | "medium" | "high";
  refundDisputeRisk: "low" | "medium" | "high";
  keyMetrics: string[];
  businessRisks: string[];
};

/**
 * Master Spec §19: every project receives a Business Model Brief.
 * Deterministic and template-based — labeled honestly as an estimate, not
 * market research (Master Spec §18: "when current research is unavailable,
 * assumptions must be labeled").
 */
export function deriveBusinessModelBrief(
  rawIdea: string,
  requirements: DerivedRequirement[],
): BusinessModelBrief {
  const targetCustomer = extractTargetCustomer(rawIdea) ?? "not specified — open question";
  const hasMonetization = requirements.some((r) => r.category === "monetization");
  const hasIntegrations = requirements.some((r) => r.category === "integrations");
  const hasPermissions = requirements.some((r) => r.category === "permissions");

  const complexitySignalCount = requirements.filter(
    (r) => r.basis === "inferred" || r.basis === "explicit",
  ).length;
  const complexity: "low" | "medium" | "high" =
    complexitySignalCount === 0 ? "low" : complexitySignalCount <= 3 ? "medium" : "high";

  return {
    targetCustomer,
    problem: `${targetCustomer === "not specified — open question" ? "The described customer" : targetCustomer} needs: ${rawIdea.trim()}`,
    offer: rawIdea.trim(),
    valueProposition: "Estimated value proposition — customer confirmation required.",
    revenueModel: hasMonetization
      ? "Customer described a payment or billing behavior — see monetization recommendations."
      : "No revenue model was described — see open questions.",
    pricingAssumptions: "Unknown — customer must provide pricing; no default price is assumed.",
    customerAcquisitionAssumptions: "Unknown — not yet researched.",
    activationEvent: hasPermissions
      ? "First successful action taken by an authenticated user."
      : "First successful use of the product's primary action.",
    retentionMechanisms: "Not yet determined.",
    supportBurden: complexity,
    operationalComplexity: complexity,
    refundDisputeRisk: hasMonetization ? "medium" : "low",
    keyMetrics: hasMonetization
      ? ["activation rate", "conversion rate", "churn"]
      : ["activation rate", "retention"],
    businessRisks: [
      ...(hasMonetization
        ? ["Payment/refund handling requires professional review before launch."]
        : []),
      ...(hasIntegrations
        ? ["Third-party integration availability and cost are not yet verified."]
        : []),
      "No market or competitor research has been performed for this idea.",
    ],
  };
}

const MONETIZATION_CATALOG: readonly MonetizationOption[] = [
  { option: "one-time payment", tradeoff: "Simple, but no recurring revenue." },
  { option: "deposit", tradeoff: "Reduces no-shows; adds refund-policy complexity." },
  { option: "subscription", tradeoff: "Predictable revenue; requires ongoing value delivery." },
  { option: "membership", tradeoff: "Builds loyalty; adds cancellation/renewal handling." },
  {
    option: "usage-based pricing",
    tradeoff: "Fair to light users; harder for customers to predict cost.",
  },
  {
    option: "freemium",
    tradeoff: "Lowers signup friction; requires a credible paid-upgrade path.",
  },
];

/**
 * Master Spec §19: "recommendations must explain tradeoffs and default
 * toward simplicity." Only surfaces deposit/subscription/membership
 * specifically when the request implies monetization; always includes
 * one-time payment as the simplest default.
 */
export function deriveMonetizationRecommendations(
  requirements: DerivedRequirement[],
): MonetizationOption[] {
  const hasMonetization = requirements.some((r) => r.category === "monetization");

  if (!hasMonetization) {
    return [MONETIZATION_CATALOG[0]!];
  }

  return MONETIZATION_CATALOG.filter((option) =>
    ["one-time payment", "deposit", "subscription", "membership"].includes(option.option),
  );
}
