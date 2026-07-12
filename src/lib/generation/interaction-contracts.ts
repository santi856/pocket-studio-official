import type { ImpactCategory } from "@/lib/orchestration/impact-analysis";

/**
 * Product Pattern and Interaction Contract System (Phase 2 extension of the
 * Blueprint Engine, Master Spec §23/§26). A Blueprint screen name or
 * workflow ("Checkout", "Primary Workflow") only describes *what* exists,
 * not the supporting behavior a real user expects from it — loading
 * states, empty states, error recovery, confirmation before an
 * irreversible action. Literal requirement compliance (the screen exists,
 * the field is present) does not by itself catch a generated product that
 * is structurally present but behaviorally hollow (e.g. a list with no
 * empty/error/loading state, or a payment step with nothing to confirm
 * before charging a card). This module makes those *implied* behaviors
 * explicit, structured data attached to the Blueprint, so later systems
 * (the generation pipeline, generated applications, and the Quality Gate,
 * P2-10) can require, implement, and check for them instead of relying on
 * a human reviewer to notice they are missing.
 *
 * Closed vocabulary, deterministic inference, honestly disclosed — the
 * same discipline as the Component Registry and Blueprint category
 * templates. Real semantic pattern recognition is Phase 3 scope (§61);
 * this is the structural foundation Phase 3 strengthens, not a substitute
 * for it.
 */

export const INTERACTION_STATES = [
  "loading",
  "empty",
  "error",
  "success",
  "disabled-while-pending",
  "confirmation",
  "retry",
] as const;

export type InteractionState = (typeof INTERACTION_STATES)[number];

export const PRODUCT_PATTERNS = [
  "list-view",
  "detail-view",
  "form-submission",
  "multi-step-workflow",
  "destructive-action",
] as const;

export type ProductPattern = (typeof PRODUCT_PATTERNS)[number];

export type PatternContract = {
  description: string;
  requiredStates: readonly InteractionState[];
};

/**
 * Every entry is a deliberately conservative, hand-authored mapping from a
 * recognized pattern to the interaction states a real implementation of it
 * needs — not an exhaustive UX specification, a floor. `destructive-action`
 * (e.g. collecting a payment) requires `confirmation` because Master Spec
 * §4.2 already classifies payments as a consequential category needing
 * explicit approval; the other patterns require the base
 * loading/empty/error/success states a real user hitting a slow network or
 * a failed request will always eventually encounter.
 */
export const PATTERN_CONTRACTS: Record<ProductPattern, PatternContract> = {
  "list-view": {
    description: "Displays a collection of records the user can browse.",
    requiredStates: ["loading", "empty", "error"],
  },
  "detail-view": {
    description: "Displays a single record's full detail.",
    requiredStates: ["loading", "error"],
  },
  "form-submission": {
    description: "Collects user input and submits it for processing.",
    requiredStates: ["loading", "error", "success", "disabled-while-pending"],
  },
  "multi-step-workflow": {
    description: "Guides a user through an ordered sequence of steps toward one outcome.",
    requiredStates: ["loading", "error", "success", "retry"],
  },
  "destructive-action": {
    description:
      "An action with a real-world consequence that is hard or impossible to undo (e.g. a payment).",
    requiredStates: ["confirmation", "loading", "error", "success"],
  },
};

export type InteractionContract = {
  patterns: ProductPattern[];
  requiredStates: InteractionState[];
};

function mergeContract(patterns: ProductPattern[]): InteractionContract {
  const uniquePatterns = Array.from(new Set(patterns));
  const requiredStates = new Set<InteractionState>();
  for (const pattern of uniquePatterns) {
    for (const state of PATTERN_CONTRACTS[pattern].requiredStates) {
      requiredStates.add(state);
    }
  }
  return { patterns: uniquePatterns, requiredStates: Array.from(requiredStates) };
}

const CHECKOUT_SCREEN_NAME = "Checkout";
const LIST_LIKE_SCREEN_NAMES = new Set(["Home", "Browse"]);

/**
 * Deterministic pattern inference for a Blueprint screen, grounded in the
 * same Impact Analysis categories the Requirements Engine and Blueprint
 * category templates already derive
 * (src/lib/generation/blueprint-templates.ts) — reusing an established,
 * already-reviewed taxonomy rather than inventing a new one. Every screen
 * gets at least one pattern; an unrecognized screen name with no matching
 * category falls back to `detail-view`, the most conservative pattern
 * (still requires loading/error handling), rather than an empty contract.
 */
export function inferScreenPatterns(
  screenName: string,
  categories: readonly ImpactCategory[],
): InteractionContract {
  const patterns: ProductPattern[] = [];

  if (screenName === CHECKOUT_SCREEN_NAME || categories.includes("monetization")) {
    patterns.push("form-submission", "destructive-action");
  }
  if (LIST_LIKE_SCREEN_NAMES.has(screenName) || categories.includes("data")) {
    patterns.push("list-view");
  }
  if (patterns.length === 0) {
    patterns.push("detail-view");
  }

  return mergeContract(patterns);
}

/**
 * Every Blueprint workflow (a named, ordered sequence of steps) is by
 * definition a multi-step-workflow that collects and submits input along
 * the way; monetization-touching ideas add destructive-action on top,
 * since Master Spec §4.2 already treats payment/subscription changes as
 * consequential.
 */
export function inferWorkflowPatterns(categories: readonly ImpactCategory[]): InteractionContract {
  const patterns: ProductPattern[] = ["multi-step-workflow", "form-submission"];
  if (categories.includes("monetization")) {
    patterns.push("destructive-action");
  }
  return mergeContract(patterns);
}

export type InteractionContractMap = Record<string, InteractionContract>;

export type InteractionContractValidationResult = {
  valid: boolean;
  violations: string[];
};

/**
 * Structural completeness check: every named screen must have a contract,
 * and every contract must declare at least one pattern and one required
 * state. This cannot yet verify a real implementation satisfies these
 * states — no component tree or renderer exists until the Structured
 * Renderer (P2-05) and no generated application exists until the
 * generation pipeline (P2-06) — but it guarantees the *requirement* is
 * recorded and cannot be silently dropped between Blueprint generation and
 * a later stage. Intended to be reused as-is by the Quality Gate (P2-10)
 * once it exists, and by conversational editing (P2-08) to check a
 * customer-modified Change Set has not silently dropped a required state.
 */
export function validateInteractionContracts(
  screens: readonly string[],
  contracts: InteractionContractMap,
): InteractionContractValidationResult {
  const violations: string[] = [];

  for (const screen of screens) {
    const contract = contracts[screen];
    if (!contract) {
      violations.push(`Screen "${screen}" has no interaction contract.`);
      continue;
    }
    if (contract.patterns.length === 0) {
      violations.push(`Screen "${screen}"'s interaction contract has no recognized pattern.`);
    }
    if (contract.requiredStates.length === 0) {
      violations.push(`Screen "${screen}"'s interaction contract has no required states.`);
    }
  }

  return { valid: violations.length === 0, violations };
}
