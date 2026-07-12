import { describe, expect, it } from "vitest";
import {
  PATTERN_CONTRACTS,
  PRODUCT_PATTERNS,
  inferScreenPatterns,
  inferWorkflowPatterns,
  validateInteractionContracts,
} from "./interaction-contracts";

describe("PATTERN_CONTRACTS", () => {
  it("defines a non-empty, classified states map for every pattern", () => {
    for (const pattern of PRODUCT_PATTERNS) {
      const states = PATTERN_CONTRACTS[pattern].states;
      expect(Object.keys(states).length).toBeGreaterThan(0);
      for (const classification of Object.values(states)) {
        expect(["required", "conventionally_implied", "consequential_decision"]).toContain(
          classification,
        );
      }
    }
  });

  it("classifies destructive-action's confirmation as a consequential_decision, never assumed approved", () => {
    expect(PATTERN_CONTRACTS["destructive-action"].states.confirmation).toBe(
      "consequential_decision",
    );
  });
});

describe("inferScreenPatterns", () => {
  it("falls back to detail-view for an unrecognized screen with no matching category", () => {
    const result = inferScreenPatterns("Settings", []);
    expect(result.patterns).toEqual(["detail-view"]);
    expect(result.requiredStates).toEqual(expect.arrayContaining(["loading", "error"]));
  });

  it("tags Home and Browse as list-view, requiring an empty state", () => {
    const home = inferScreenPatterns("Home", []);
    const browse = inferScreenPatterns("Browse", []);
    expect(home.patterns).toContain("list-view");
    expect(browse.patterns).toContain("list-view");
    expect(home.requiredStates).toContain("empty");
  });

  it("tags any data-category screen as list-view even if unnamed Home/Browse", () => {
    const result = inferScreenPatterns("Records", ["data"]);
    expect(result.patterns).toContain("list-view");
  });

  it("tags Checkout as form-submission + destructive-action, requiring confirmation", () => {
    const result = inferScreenPatterns("Checkout", ["monetization"]);
    expect(result.patterns).toEqual(
      expect.arrayContaining(["form-submission", "destructive-action"]),
    );
    expect(result.requiredStates).toContain("confirmation");
  });

  it("tags any monetization-category screen as destructive-action even off the Checkout name", () => {
    const result = inferScreenPatterns("Billing", ["monetization"]);
    expect(result.patterns).toContain("destructive-action");
    expect(result.requiredStates).toContain("confirmation");
  });

  it("de-duplicates required states across multiple matched patterns", () => {
    const result = inferScreenPatterns("Checkout", ["monetization", "data"]);
    const loadingCount = result.requiredStates.filter((state) => state === "loading").length;
    expect(loadingCount).toBe(1);
  });
});

describe("inferWorkflowPatterns", () => {
  it("always includes multi-step-workflow and form-submission", () => {
    const result = inferWorkflowPatterns([]);
    expect(result.patterns).toEqual(["multi-step-workflow", "form-submission"]);
    expect(result.requiredStates).toEqual(expect.arrayContaining(["loading", "error", "success"]));
  });

  it("adds destructive-action (and confirmation) for a monetization-touching idea", () => {
    const result = inferWorkflowPatterns(["monetization"]);
    expect(result.patterns).toContain("destructive-action");
    expect(result.requiredStates).toContain("confirmation");
  });
});

describe("validateInteractionContracts", () => {
  it("passes when every screen has a well-formed contract", () => {
    const result = validateInteractionContracts(["Home"], {
      Home: inferScreenPatterns("Home", []),
    });
    expect(result).toEqual({ valid: true, violations: [] });
  });

  it("flags a screen with no contract entry at all", () => {
    const result = validateInteractionContracts(["Home", "Checkout"], {
      Home: inferScreenPatterns("Home", []),
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('Screen "Checkout" has no interaction contract.');
  });

  it("flags a contract with zero patterns", () => {
    const result = validateInteractionContracts(["Home"], {
      Home: {
        patterns: [],
        requiredStates: ["loading"],
        stateClassifications: { loading: "required" },
        consequentialStates: [],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      'Screen "Home"\'s interaction contract has no recognized pattern.',
    );
  });

  it("flags a contract with zero required states", () => {
    const result = validateInteractionContracts(["Home"], {
      Home: {
        patterns: ["detail-view"],
        requiredStates: [],
        stateClassifications: {},
        consequentialStates: [],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      'Screen "Home"\'s interaction contract has no required states.',
    );
  });
});

describe("inference classification precedence", () => {
  it("keeps the stricter classification when patterns disagree on the same state", () => {
    // form-submission classifies "loading" as required; no pattern in this
    // registry currently classifies any shared state more loosely, so this
    // guards the merge behavior itself: destructive-action's consequential
    // "confirmation" must survive being merged alongside form-submission's
    // unrelated states, not get diluted.
    const result = inferScreenPatterns("Checkout", ["monetization"]);
    expect(result.stateClassifications.confirmation).toBe("consequential_decision");
    expect(result.consequentialStates).toEqual(["confirmation"]);
  });
});
