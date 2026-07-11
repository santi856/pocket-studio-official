import { describe, expect, it } from "vitest";
import { deriveRequirements } from "./requirements-engine";
import {
  deriveBusinessModelBrief,
  deriveMonetizationRecommendations,
} from "./business-intelligence";

describe("deriveBusinessModelBrief", () => {
  it("labels an unspecified target customer as an open question, not a guess", () => {
    const requirements = deriveRequirements("Build a booking app.");
    const brief = deriveBusinessModelBrief("Build a booking app.", requirements);
    expect(brief.targetCustomer).toBe("not specified — open question");
  });

  it("never assumes a price — pricingAssumptions is always unknown by default", () => {
    const requirements = deriveRequirements("Add appointment deposits.");
    const brief = deriveBusinessModelBrief("Add appointment deposits.", requirements);
    expect(brief.pricingAssumptions).toMatch(/unknown/i);
  });

  it("flags refund/dispute risk as medium when monetization is present", () => {
    const rawIdea = "Add appointment deposits and monthly memberships.";
    const requirements = deriveRequirements(rawIdea);
    const brief = deriveBusinessModelBrief(rawIdea, requirements);
    expect(brief.refundDisputeRisk).toBe("medium");
  });

  it("flags refund/dispute risk as low when there is no monetization signal", () => {
    const rawIdea = "Build a booking app.";
    const requirements = deriveRequirements(rawIdea);
    const brief = deriveBusinessModelBrief(rawIdea, requirements);
    expect(brief.refundDisputeRisk).toBe("low");
  });

  it("always discloses that no market research has been performed", () => {
    const requirements = deriveRequirements("Build a booking app.");
    const brief = deriveBusinessModelBrief("Build a booking app.", requirements);
    expect(brief.businessRisks).toContain(
      "No market or competitor research has been performed for this idea.",
    );
  });
});

describe("deriveMonetizationRecommendations", () => {
  it("recommends only one-time payment when no monetization signal is present", () => {
    const requirements = deriveRequirements("Build a booking app.");
    const recommendations = deriveMonetizationRecommendations(requirements);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.option).toBe("one-time payment");
  });

  it("recommends deposits and subscriptions with tradeoffs when monetization is described", () => {
    const requirements = deriveRequirements("Add appointment deposits and monthly memberships.");
    const recommendations = deriveMonetizationRecommendations(requirements);
    const options = recommendations.map((r) => r.option);
    expect(options).toContain("deposit");
    expect(options).toContain("subscription");
    expect(recommendations.every((r) => r.tradeoff.length > 0)).toBe(true);
  });
});
