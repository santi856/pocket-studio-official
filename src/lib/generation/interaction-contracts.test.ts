import { describe, expect, it } from "vitest";
import {
  PATTERN_CONTRACTS,
  PRODUCT_PATTERNS,
  RENDERER_IMPLEMENTED_STATES,
  computeUnsupportedStates,
  inferScreenPatterns,
  inferWorkflowPatterns,
  validateInteractionContracts,
  workflowContractKey,
} from "./interaction-contracts";
import type { InferenceClassification, InteractionState } from "./interaction-contracts";

const ALL_CLASSIFICATIONS: readonly InferenceClassification[] = [
  "required",
  "conventionally_implied",
  "recommended",
  "optional",
  "consequential_decision",
  "unresolved",
];

describe("PATTERN_CONTRACTS", () => {
  it("defines a non-empty, classified states map for every pattern", () => {
    for (const pattern of PRODUCT_PATTERNS) {
      const states = PATTERN_CONTRACTS[pattern].states;
      expect(Object.keys(states).length).toBeGreaterThan(0);
      for (const classification of Object.values(states)) {
        expect(ALL_CLASSIFICATIONS).toContain(classification);
      }
    }
  });

  it("classifies destructive-action's confirmation as a consequential_decision, never assumed approved", () => {
    expect(PATTERN_CONTRACTS["destructive-action"].states.confirmation).toBe(
      "consequential_decision",
    );
  });

  it("classifies multi-step-workflow's confirmation as unresolved — genuinely unknowable from the pattern alone", () => {
    expect(PATTERN_CONTRACTS["multi-step-workflow"].states.confirmation).toBe("unresolved");
  });

  it("classifies read-only patterns' retry as recommended, not required or a floor omission", () => {
    expect(PATTERN_CONTRACTS["list-view"].states.retry).toBe("recommended");
    expect(PATTERN_CONTRACTS["detail-view"].states.retry).toBe("recommended");
  });
});

describe("inferScreenPatterns", () => {
  it("falls back to detail-view for an unrecognized screen with no matching category", () => {
    const result = inferScreenPatterns("Settings", [], "Build a settings screen.");
    expect(result.patterns).toEqual(["detail-view"]);
    expect(result.requiredStates).toEqual(expect.arrayContaining(["loading", "error"]));
  });

  it("tags Home and Browse as list-view, requiring an empty state", () => {
    const home = inferScreenPatterns("Home", [], "idea");
    const browse = inferScreenPatterns("Browse", [], "idea");
    expect(home.patterns).toContain("list-view");
    expect(browse.patterns).toContain("list-view");
    expect(home.requiredStates).toContain("empty");
  });

  it("tags any data-category screen as list-view even if unnamed Home/Browse", () => {
    const result = inferScreenPatterns("Records", ["data"], "idea");
    expect(result.patterns).toContain("list-view");
  });

  it("tags Checkout as form-submission + destructive-action, requiring confirmation", () => {
    const result = inferScreenPatterns("Checkout", ["monetization"], "idea");
    expect(result.patterns).toEqual(
      expect.arrayContaining(["form-submission", "destructive-action"]),
    );
    expect(result.requiredStates).toContain("confirmation");
  });

  it("tags any monetization-category screen as destructive-action even off the Checkout name", () => {
    const result = inferScreenPatterns("Billing", ["monetization"], "idea");
    expect(result.patterns).toContain("destructive-action");
    expect(result.requiredStates).toContain("confirmation");
  });

  it("de-duplicates required states across multiple matched patterns", () => {
    const result = inferScreenPatterns("Checkout", ["monetization", "data"], "idea");
    const loadingCount = result.requiredStates.filter((state) => state === "loading").length;
    expect(loadingCount).toBe(1);
  });
});

describe("inferWorkflowPatterns", () => {
  it("always includes multi-step-workflow and form-submission", () => {
    const result = inferWorkflowPatterns([], "idea");
    expect(result.patterns).toEqual(["multi-step-workflow", "form-submission"]);
    expect(result.requiredStates).toEqual(expect.arrayContaining(["loading", "error", "success"]));
  });

  it("adds destructive-action (and confirmation) for a monetization-touching idea", () => {
    const result = inferWorkflowPatterns(["monetization"], "idea");
    expect(result.patterns).toContain("destructive-action");
    expect(result.requiredStates).toContain("confirmation");
  });

  it("classifies confirmation as consequential_decision (not unresolved) once monetization is present — the stricter obligation wins on merge", () => {
    const result = inferWorkflowPatterns(["monetization"], "idea");
    expect(result.stateClassifications.confirmation).toBe("consequential_decision");
  });

  it("classifies confirmation as unresolved (not silently absent) for a non-monetization workflow", () => {
    const result = inferWorkflowPatterns([], "idea with no monetization");
    expect(result.stateClassifications.confirmation).toBe("unresolved");
    expect(result.unresolvedStates).toContain("confirmation");
  });
});

describe("stateBasis (explicit vs inferred)", () => {
  it("classifies a state as inferred when the idea text never mentions it", () => {
    const result = inferScreenPatterns("Home", [], "Build a booking app for mobile detailers.");
    expect(result.stateBasis.loading).toBe("inferred");
  });

  it("classifies a state as explicit when the customer's own words ask for it", () => {
    const result = inferScreenPatterns(
      "Home",
      [],
      "Build a booking app with a loading spinner while it fetches results.",
    );
    expect(result.stateBasis.loading).toBe("explicit");
  });

  it("detects an explicit retry request", () => {
    const result = inferScreenPatterns(
      "Home",
      [],
      "Build a booking app — let users retry if the request fails.",
    );
    expect(result.stateBasis.retry).toBe("explicit");
  });

  it("does not false-positive match a keyword embedded mid-word", () => {
    // "retrying" contains "retry" but not at the exact phrase "retry
    // button"/"try again"/etc. this checks against — must not explicit-match.
    const result = inferScreenPatterns(
      "Home",
      [],
      "Build an app for retrying failed shipments logistically.",
    );
    expect(result.stateBasis.retry).toBe("inferred");
  });
});

describe("computeUnsupportedStates", () => {
  it("returns empty when every classified state is in the implemented set", () => {
    const classifications = new Map<InteractionState, InferenceClassification>([
      ["loading", "required"],
      ["error", "required"],
    ]);
    expect(computeUnsupportedStates(classifications, RENDERER_IMPLEMENTED_STATES)).toEqual([]);
  });

  it("flags a state absent from a deliberately smaller implemented set", () => {
    const classifications = new Map<InteractionState, InferenceClassification>([
      ["loading", "required"],
      ["retry", "recommended"],
    ]);
    const smallerSet = new Set<InteractionState>(["loading"]);
    expect(computeUnsupportedStates(classifications, smallerSet)).toEqual(["retry"]);
  });

  it("never flags a consequential_decision state as unsupported — it is disclosed, not auto-rendered, by design", () => {
    const classifications = new Map<InteractionState, InferenceClassification>([
      ["confirmation", "consequential_decision"],
    ]);
    const emptySet = new Set<InteractionState>([]);
    expect(computeUnsupportedStates(classifications, emptySet)).toEqual([]);
  });

  it("reports zero unsupported states against the real renderer-implemented set for every pattern today", () => {
    for (const pattern of PRODUCT_PATTERNS) {
      const result = inferScreenPatterns(
        "X",
        pattern === "form-submission" || pattern === "destructive-action" ? ["monetization"] : [],
        "idea",
      );
      expect(result.unsupportedStates).toEqual([]);
    }
  });
});

describe("workflowContractKey", () => {
  it("produces the shared, stable key convention every caller reuses", () => {
    expect(workflowContractKey("Primary Workflow")).toBe("workflow:Primary Workflow");
  });
});

describe("validateInteractionContracts", () => {
  it("passes when every screen has a well-formed contract", () => {
    const result = validateInteractionContracts(["Home"], {
      Home: inferScreenPatterns("Home", [], "idea"),
    });
    expect(result).toEqual({ valid: true, violations: [] });
  });

  it("passes for a workflow subject key exactly like a screen name", () => {
    const key = workflowContractKey("Primary Workflow");
    const result = validateInteractionContracts([key], {
      [key]: inferWorkflowPatterns([], "idea"),
    });
    expect(result).toEqual({ valid: true, violations: [] });
  });

  it("flags a workflow with no contract entry at all — not just screens", () => {
    const key = workflowContractKey("Primary Workflow");
    const result = validateInteractionContracts(["Home", key], {
      Home: inferScreenPatterns("Home", [], "idea"),
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(`"${key}" has no interaction contract.`);
  });

  it("flags a subject with no contract entry at all", () => {
    const result = validateInteractionContracts(["Home", "Checkout"], {
      Home: inferScreenPatterns("Home", [], "idea"),
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('"Checkout" has no interaction contract.');
  });

  it("flags a contract with zero patterns", () => {
    const result = validateInteractionContracts(["Home"], {
      Home: {
        patterns: [],
        requiredStates: ["loading"],
        stateClassifications: { loading: "required" },
        consequentialStates: [],
        unresolvedStates: [],
        unsupportedStates: [],
        stateBasis: { loading: "inferred" },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain(
      '"Home"\'s interaction contract has no recognized pattern.',
    );
  });

  it("flags a contract with zero required states", () => {
    const result = validateInteractionContracts(["Home"], {
      Home: {
        patterns: ["detail-view"],
        requiredStates: [],
        stateClassifications: {},
        consequentialStates: [],
        unresolvedStates: [],
        unsupportedStates: [],
        stateBasis: {},
      },
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('"Home"\'s interaction contract has no required states.');
  });
});

describe("inference classification precedence", () => {
  it("keeps the stricter classification when patterns disagree on the same state", () => {
    // form-submission classifies "loading" as required; no pattern in this
    // registry currently classifies any shared state more loosely, so this
    // guards the merge behavior itself: destructive-action's consequential
    // "confirmation" must survive being merged alongside form-submission's
    // unrelated states, not get diluted.
    const result = inferScreenPatterns("Checkout", ["monetization"], "idea");
    expect(result.stateClassifications.confirmation).toBe("consequential_decision");
    expect(result.consequentialStates).toEqual(["confirmation"]);
  });
});
