import { describe, expect, it } from "vitest";
import { analyzeImpact } from "./impact-analysis";

describe("analyzeImpact", () => {
  it("flags monetization as consequential", () => {
    const result = analyzeImpact("Add appointment deposits and monthly memberships.");
    expect(result.categories).toContain("monetization");
    expect(result.consequential).toBe(true);
  });

  it("flags security-related requests as consequential", () => {
    const result = analyzeImpact("Add two-factor authentication to the login screen.");
    expect(result.categories).toContain("security");
    expect(result.consequential).toBe(true);
  });

  it("does not mark a plain product idea as consequential and matches no categories", () => {
    const result = analyzeImpact("Build a premium booking app for mobile detailers.");
    expect(result.consequential).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it("does not false-positive-match a short keyword embedded in an unrelated word", () => {
    // Regression test: "build" contains the substring "ui" (the "screens"
    // keyword). Plain .includes() matching wrongly tagged this as
    // "screens" — word-boundary matching must not.
    const result = analyzeImpact("Build a quick guide.");
    expect(result.categories).not.toContain("screens");
  });

  it("returns no categories and rationale for unmatched text", () => {
    const result = analyzeImpact("asdf qwer zxcv");
    expect(result.categories).toEqual([]);
    expect(result.consequential).toBe(false);
    expect(result.rationale).toEqual([]);
  });

  it("can match multiple categories in one request", () => {
    const result = analyzeImpact(
      "Add a payment webhook integration and a new screen for receipts.",
    );
    expect(result.categories).toEqual(
      expect.arrayContaining(["monetization", "integrations", "screens"]),
    );
  });
});
