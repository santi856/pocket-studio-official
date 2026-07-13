import { describe, expect, it } from "vitest";
import { classifyMobileCommerce } from "./store-readiness";

describe("classifyMobileCommerce", () => {
  it("reports no commerce when the Blueprint has no monetization content", () => {
    const result = classifyMobileCommerce("Build a journaling app.", []);
    expect(result).toEqual({ hasCommerce: false, categories: [], unclassified: false });
  });

  it("classifies a real booking-with-deposits idea as physical_services", () => {
    const result = classifyMobileCommerce(
      "Build a premium booking app for mobile detailers with appointment deposits.",
      ["Collect payment as part of the primary workflow."],
    );
    expect(result.hasCommerce).toBe(true);
    expect(result.categories).toContain("physical_services");
    expect(result.unclassified).toBe(false);
  });

  it("classifies a subscription idea as digital_subscriptions", () => {
    const result = classifyMobileCommerce(
      "Build a fitness app with a monthly membership subscription.",
      ["Collect payment as part of the primary workflow."],
    );
    expect(result.categories).toContain("digital_subscriptions");
  });

  it("classifies a shipped-goods idea as physical_goods", () => {
    const result = classifyMobileCommerce(
      "Build a store where customers order merchandise for shipping.",
      ["Collect payment as part of the primary workflow."],
    );
    expect(result.categories).toContain("physical_goods");
  });

  it("honestly reports unclassified when monetization exists but no keyword matches", () => {
    const result = classifyMobileCommerce("Build an app that helps people track their mood.", [
      "Collect payment as part of the primary workflow.",
    ]);
    expect(result.hasCommerce).toBe(true);
    expect(result.categories).toEqual([]);
    expect(result.unclassified).toBe(true);
  });

  it("does not false-positive match a keyword embedded mid-word", () => {
    // "worship" contains the substring "ship" but not at a word boundary --
    // the classifier must not match "physical_goods" here.
    const result = classifyMobileCommerce(
      "Build a tool for tracking worship attendance at a congregation.",
      ["Collect payment as part of the primary workflow."],
    );
    expect(result.categories).not.toContain("physical_goods");
    expect(result.unclassified).toBe(true);
  });
});
