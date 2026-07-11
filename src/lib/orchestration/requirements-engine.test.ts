import { describe, expect, it } from "vitest";
import {
  deriveOpenQuestions,
  deriveRequirements,
  extractTargetCustomer,
  suggestCapabilityKeys,
} from "./requirements-engine";

describe("extractTargetCustomer", () => {
  it("extracts the audience from a 'for <audience>' pattern", () => {
    expect(extractTargetCustomer("Build a premium booking app for mobile detailers.")).toBe(
      "mobile detailers",
    );
  });

  it("returns null when no audience pattern is present", () => {
    expect(extractTargetCustomer("Build a booking app.")).toBeNull();
  });
});

describe("deriveRequirements", () => {
  it("always includes the recommended base web-generation requirement", () => {
    const requirements = deriveRequirements("Build a booking app.");
    expect(requirements.some((r) => r.basis === "recommended")).toBe(true);
  });

  it("derives an inferred monetization requirement from deposit language", () => {
    const requirements = deriveRequirements("Add appointment deposits and monthly memberships.");
    const monetization = requirements.find((r) => r.category === "monetization");
    expect(monetization?.basis).toBe("inferred");
  });
});

describe("deriveOpenQuestions", () => {
  it("asks who the target customer is when none was extracted", () => {
    const requirements = deriveRequirements("Build a booking app.");
    const questions = deriveOpenQuestions("Build a booking app.", requirements);
    expect(questions).toContain("Who is the primary target customer for this product?");
  });

  it("does not ask about target customer when one was extracted", () => {
    const rawIdea = "Build a premium booking app for mobile detailers.";
    const requirements = deriveRequirements(rawIdea);
    const questions = deriveOpenQuestions(rawIdea, requirements);
    expect(questions).not.toContain("Who is the primary target customer for this product?");
  });

  it("asks about revenue model when no monetization signal is present", () => {
    const requirements = deriveRequirements("Build a booking app.");
    const questions = deriveOpenQuestions("Build a booking app.", requirements);
    expect(questions).toContain("How should this product generate revenue, if at all?");
  });
});

describe("suggestCapabilityKeys", () => {
  it("always includes the base web-generation capability", () => {
    const requirements = deriveRequirements("Build a booking app.");
    expect(suggestCapabilityKeys(requirements)).toContain("generation.full_stack_web_app");
  });

  it("includes payment capability keys when monetization is inferred", () => {
    const requirements = deriveRequirements("Add appointment deposits.");
    const keys = suggestCapabilityKeys(requirements);
    expect(keys).toContain("payments.deposits");
    expect(keys).toContain("payments.subscriptions");
  });

  it("never invents a capability key outside the known set", () => {
    const requirements = deriveRequirements(
      "Add appointment deposits, screens, actions, testing, and a launch plan.",
    );
    const keys = suggestCapabilityKeys(requirements);
    const knownPrefixes = ["generation.", "payments.", "governance."];
    expect(keys.every((key) => knownPrefixes.some((prefix) => key.startsWith(prefix)))).toBe(true);
  });
});
