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
 *
 * D-0022 clarification: this registry's 5 patterns and 7 states are an
 * initial foundation for a broader "practical product completeness"
 * standard, not the final model. Each state a pattern implies is now also
 * classified (Inference Boundaries, below) so low-risk conventions can be
 * inferred automatically while consequential ones are always surfaced
 * through the product's real Decision Ledger, never assumed approved.
 * Extending this into full requirement inference across Product
 * Intelligence, the Build Planner, Component Registry behavioral
 * capabilities, the renderer, generated tests, and the Quality Gate is
 * explicitly Phase 2 work still to come (P2-03, P2-05, P2-06, P2-10) —
 * this module does not attempt to complete that pipeline on its own.
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

/**
 * Inference Boundaries (common-sense product reasoning clarification,
 * D-0022): a state a pattern implies is not all-or-nothing — it carries a
 * different obligation depending on risk and reversibility.
 *
 * - `required`: necessary for correctness or truthful operation; always
 *   implement.
 * - `conventionally_implied`: a low-risk behavior users normally expect;
 *   infer and include automatically.
 * - `consequential_decision`: affects money, legal obligations, privacy,
 *   security, publication, or another irreversible/high-impact
 *   consequence. Never silently assume approval — surface it through the
 *   product's existing Decision Ledger disclosure/approval model
 *   (src/lib/product/decisions.ts) once an actual build is being approved,
 *   not merely inferred as a UI nicety.
 *
 * `recommended`/`optional`/`unsupported`/`unresolved` are not static
 * properties of a pattern — they depend on product-specific context this
 * fixed map cannot see, so they are not modeled here; a future
 * context-aware layer (Build Planner, P2-03) applies them.
 */
export const INFERENCE_CLASSIFICATIONS = [
  "required",
  "conventionally_implied",
  "consequential_decision",
] as const;

export type InferenceClassification = (typeof INFERENCE_CLASSIFICATIONS)[number];

// Strictest first: when two patterns imply the same state at different
// classifications (e.g. one pattern treats "error" as required, another
// would only conventionally imply it), the stricter obligation wins —
// never silently downgrade a requirement.
const CLASSIFICATION_PRECEDENCE: readonly InferenceClassification[] = [
  "consequential_decision",
  "required",
  "conventionally_implied",
];

function stricterClassification(
  a: InferenceClassification,
  b: InferenceClassification,
): InferenceClassification {
  return CLASSIFICATION_PRECEDENCE.indexOf(a) <= CLASSIFICATION_PRECEDENCE.indexOf(b) ? a : b;
}

export type PatternContract = {
  description: string;
  states: Readonly<Partial<Record<InteractionState, InferenceClassification>>>;
};

/**
 * Every entry is a deliberately conservative, hand-authored mapping from a
 * recognized pattern to the interaction states a real implementation of it
 * needs — not an exhaustive UX specification, a floor. `destructive-action`
 * (e.g. collecting a payment) classifies `confirmation` as
 * `consequential_decision` because Master Spec §4.2 already treats
 * payments as a consequential category needing explicit approval — this
 * module records that it is required, but approving it is not this
 * module's decision to make. The other patterns require the base
 * loading/empty/error/success states a real user hitting a slow network or
 * a failed request will always eventually encounter.
 */
export const PATTERN_CONTRACTS: Record<ProductPattern, PatternContract> = {
  "list-view": {
    description: "Displays a collection of records the user can browse.",
    states: { loading: "required", empty: "required", error: "required" },
  },
  "detail-view": {
    description: "Displays a single record's full detail.",
    states: { loading: "required", error: "required" },
  },
  "form-submission": {
    description: "Collects user input and submits it for processing.",
    states: {
      loading: "required",
      error: "required",
      success: "required",
      "disabled-while-pending": "conventionally_implied",
    },
  },
  "multi-step-workflow": {
    description: "Guides a user through an ordered sequence of steps toward one outcome.",
    states: {
      loading: "required",
      error: "required",
      success: "required",
      retry: "conventionally_implied",
    },
  },
  "destructive-action": {
    description:
      "An action with a real-world consequence that is hard or impossible to undo (e.g. a payment).",
    states: {
      confirmation: "consequential_decision",
      loading: "required",
      error: "required",
      success: "required",
    },
  },
};

export type InteractionContract = {
  patterns: ProductPattern[];
  // Every state any matched pattern implies, regardless of classification
  // — preserved as a flat list for the structural-completeness check
  // (validateInteractionContracts) and for backward-compatible callers.
  requiredStates: InteractionState[];
  // Per-state classification (Inference Boundaries above). A state absent
  // from `requiredStates` is also absent here.
  stateClassifications: Readonly<Partial<Record<InteractionState, InferenceClassification>>>;
  // Convenience: states classified consequential_decision, i.e. never to
  // be silently assumed approved.
  consequentialStates: InteractionState[];
};

function mergeContract(patterns: ProductPattern[]): InteractionContract {
  const uniquePatterns = Array.from(new Set(patterns));
  const classifications = new Map<InteractionState, InferenceClassification>();

  for (const pattern of uniquePatterns) {
    for (const [state, classification] of Object.entries(
      PATTERN_CONTRACTS[pattern].states,
    ) as Array<[InteractionState, InferenceClassification]>) {
      const existing = classifications.get(state);
      classifications.set(
        state,
        existing ? stricterClassification(existing, classification) : classification,
      );
    }
  }

  const requiredStates = Array.from(classifications.keys());
  const stateClassifications = Object.fromEntries(classifications) as Partial<
    Record<InteractionState, InferenceClassification>
  >;
  const consequentialStates = requiredStates.filter(
    (state) => classifications.get(state) === "consequential_decision",
  );

  return { patterns: uniquePatterns, requiredStates, stateClassifications, consequentialStates };
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
