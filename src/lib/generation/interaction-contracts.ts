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
 * D-0022/P2-EXIT clarification: this registry's 5 patterns and 7 states
 * distinguish behavior along three orthogonal axes rather than one flat
 * label, so "explicit, inferred, recommended, optional, unresolved,
 * unsupported, and consequential" are all real, checkable values, not
 * just declared vocabulary:
 *  - `InferenceClassification` (`stateClassifications`): how strongly a
 *    state is obligated — required / conventionally_implied / recommended
 *    / optional / consequential_decision / unresolved.
 *  - `StateBasis` (`stateBasis`): whether the state's presence came from
 *    the customer's own words in the original idea (`explicit`, via
 *    keyword matching) or purely from pattern inference (`inferred`).
 *  - `unsupportedStates`: states this build's renderer genuinely cannot
 *    implement today (checked against `RENDERER_IMPLEMENTED_STATES`,
 *    below) — a capability gap, never silently downgraded to "not
 *    required" just because it can't be built yet.
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
 * D-0022, extended at P2-EXIT): a state a pattern implies is not
 * all-or-nothing — it carries a different obligation depending on risk,
 * reversibility, and how settled the question is.
 *
 * - `required`: necessary for correctness or truthful operation; always
 *   implement.
 * - `conventionally_implied`: a low-risk behavior users normally expect;
 *   infer and include automatically.
 * - `recommended`: a real, genuine improvement (e.g. offering retry after
 *   a failed read) that is not required for the pattern to be considered
 *   correct — a professional implementation includes it, but its absence
 *   is not a defect.
 * - `optional`: one valid implementation choice among several equally
 *   correct alternatives (e.g. disabling a button while pending vs.
 *   showing a full-screen loading overlay instead) — neither this system
 *   nor a reviewer should treat its absence as incomplete.
 * - `consequential_decision`: affects money, legal obligations, privacy,
 *   security, publication, or another irreversible/high-impact
 *   consequence. Never silently assume approval — surface it through the
 *   product's existing Decision Ledger disclosure/approval model
 *   (src/lib/product/decisions.ts) once an actual build is being approved,
 *   not merely inferred as a UI nicety.
 * - `unresolved`: this fixed, product-agnostic map genuinely cannot
 *   determine whether the state applies from the pattern alone (e.g.
 *   whether a non-monetization multi-step workflow's final step needs a
 *   confirmation prompt depends on product-specific stakes this module
 *   cannot see) — recorded as an open question (surfaced in
 *   `Blueprint.openDecisions`, the same place `consequential_decision`
 *   states are recorded), not silently decided either way.
 */
export const INFERENCE_CLASSIFICATIONS = [
  "required",
  "conventionally_implied",
  "recommended",
  "optional",
  "consequential_decision",
  "unresolved",
] as const;

export type InferenceClassification = (typeof INFERENCE_CLASSIFICATIONS)[number];

// Strictest first: when two patterns imply the same state at different
// classifications (e.g. one pattern treats "error" as required, another
// would only conventionally imply it), the stricter obligation wins —
// never silently downgrade a requirement. `unresolved` ranks just below
// `consequential_decision`: an unanswered question is not allowed to be
// quietly dropped just because another matched pattern treats the same
// state as merely optional.
const CLASSIFICATION_PRECEDENCE: readonly InferenceClassification[] = [
  "consequential_decision",
  "unresolved",
  "required",
  "conventionally_implied",
  "recommended",
  "optional",
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
 * a failed request will always eventually encounter. `retry` is
 * `recommended` (not required) on read-only patterns — a real, genuine
 * improvement, not a floor requirement. `multi-step-workflow`'s
 * `disabled-while-pending` is `optional` (a full-screen loading overlay is
 * an equally valid alternative), and its `confirmation` is `unresolved` —
 * unlike `destructive-action`, a plain multi-step workflow's stakes are
 * genuinely unknowable from the pattern alone.
 */
export const PATTERN_CONTRACTS: Record<ProductPattern, PatternContract> = {
  "list-view": {
    description: "Displays a collection of records the user can browse.",
    states: { loading: "required", empty: "required", error: "required", retry: "recommended" },
  },
  "detail-view": {
    description: "Displays a single record's full detail.",
    states: { loading: "required", error: "required", retry: "recommended" },
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
      "disabled-while-pending": "optional",
      confirmation: "unresolved",
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

/**
 * Whether a state's presence in a contract came from the customer's own
 * words in the original idea (`explicit`, detected via the same
 * word-boundary keyword-matching discipline already established in
 * impact-analysis.ts/store-readiness.ts) or purely from deterministic
 * pattern inference (`inferred`, the default). Real signal, not a
 * cosmetic label: an idea that says "show a loading spinner while it
 * saves" is asserting something the customer actually said, distinct from
 * a state this module merely assumed because the screen matched a
 * pattern.
 */
export const STATE_BASIS = ["explicit", "inferred"] as const;
export type StateBasis = (typeof STATE_BASIS)[number];

const EXPLICIT_STATE_KEYWORDS: Readonly<Record<InteractionState, readonly string[]>> = {
  loading: ["loading spinner", "loading indicator", "loading state", "loading screen"],
  empty: ["empty state", "no results found", "no items yet", "nothing to show"],
  error: ["error message", "error handling", "error state", "handle errors"],
  success: ["success message", "confirmation screen", "thank you page", "success screen"],
  "disabled-while-pending": [
    "disable the button while",
    "prevent double submission",
    "prevent double-clicking",
    "disable while submitting",
  ],
  confirmation: ["confirm before", "confirmation step", "are you sure", "double-check before"],
  retry: ["retry button", "try again", "allow retry", "let users retry"],
};

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegExp(phrase)}`, "i").test(text);
}

function computeBasis(state: InteractionState, ideaText: string): StateBasis {
  const keywords = EXPLICIT_STATE_KEYWORDS[state];
  return keywords.some((phrase) => textContainsPhrase(ideaText, phrase)) ? "explicit" : "inferred";
}

/**
 * States this build's renderer/runtime genuinely implements today
 * (component-renderer.tsx + screen-data-binding.ts + render-runtime.ts) —
 * `loading`/`empty`/`error` as real swapped-in primitives, `success` as a
 * real post-submission outcome, `disabled-while-pending` and `retry` as of
 * P2-EXIT's renderer completeness pass. `confirmation` is deliberately
 * excluded: it is handled via disclosure and Decision Ledger approval
 * (never auto-rendered without a customer decision, since it is always
 * `consequential_decision`-classified when it appears at all) — a
 * different, equally valid completeness path, not an implementation gap.
 */
export const RENDERER_IMPLEMENTED_STATES: ReadonlySet<InteractionState> = new Set([
  "loading",
  "empty",
  "error",
  "success",
  "disabled-while-pending",
  "retry",
]);

/**
 * A state classified anything other than `consequential_decision` (i.e.
 * this module is claiming it will actually be implemented, not merely
 * disclosed for approval) but absent from `implementedStates` is a real
 * capability gap — surfaced here rather than silently treated as "not
 * required" just because the renderer cannot build it yet. Takes
 * `implementedStates` as a parameter (defaulting to the real
 * `RENDERER_IMPLEMENTED_STATES`) so the mechanism itself is unit-testable
 * against a deliberately smaller set without needing a live production gap
 * to exercise it.
 */
export function computeUnsupportedStates(
  classifications: ReadonlyMap<InteractionState, InferenceClassification>,
  implementedStates: ReadonlySet<InteractionState> = RENDERER_IMPLEMENTED_STATES,
): InteractionState[] {
  const unsupported: InteractionState[] = [];
  for (const [state, classification] of classifications) {
    if (classification === "consequential_decision") continue;
    if (!implementedStates.has(state)) {
      unsupported.push(state);
    }
  }
  return unsupported;
}

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
  // Convenience: states classified unresolved, i.e. an open question this
  // module cannot answer from the pattern alone — recorded, not decided.
  unresolvedStates: InteractionState[];
  // Convenience: states this module claims will be implemented but this
  // build's renderer genuinely cannot build yet — a real capability gap.
  unsupportedStates: InteractionState[];
  // Per-state basis: did the customer's own words ask for this, or was it
  // purely pattern-inferred? A state absent from `requiredStates` is also
  // absent here.
  stateBasis: Readonly<Partial<Record<InteractionState, StateBasis>>>;
};

function mergeContract(patterns: ProductPattern[], ideaText: string): InteractionContract {
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
  const unresolvedStates = requiredStates.filter(
    (state) => classifications.get(state) === "unresolved",
  );
  const unsupportedStates = computeUnsupportedStates(classifications);
  const stateBasis = Object.fromEntries(
    requiredStates.map((state) => [state, computeBasis(state, ideaText)]),
  ) as Partial<Record<InteractionState, StateBasis>>;

  return {
    patterns: uniquePatterns,
    requiredStates,
    stateClassifications,
    consequentialStates,
    unresolvedStates,
    unsupportedStates,
    stateBasis,
  };
}

// Exported so other Blueprint-derived systems (e.g. the Build Planner,
// P2-03) can reuse the exact same screen-name conventions instead of
// re-declaring their own copy.
export const CHECKOUT_SCREEN_NAME = "Checkout";
export const LIST_LIKE_SCREEN_NAMES = new Set(["Home", "Browse"]);

/**
 * The shared key convention for a workflow's entry in an
 * `InteractionContractMap` — exported so every caller (Blueprint
 * generation, the Build Planner, restore validation) uses the exact same
 * key instead of re-deriving it, which is how a workflow's contract went
 * unvalidated and unconsumed before P2-EXIT's completeness pass.
 */
export function workflowContractKey(workflowName: string): string {
  return `workflow:${workflowName}`;
}

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
  ideaText: string,
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

  return mergeContract(patterns, ideaText);
}

/**
 * Every Blueprint workflow (a named, ordered sequence of steps) is by
 * definition a multi-step-workflow that collects and submits input along
 * the way; monetization-touching ideas add destructive-action on top,
 * since Master Spec §4.2 already treats payment/subscription changes as
 * consequential.
 */
export function inferWorkflowPatterns(
  categories: readonly ImpactCategory[],
  ideaText: string,
): InteractionContract {
  const patterns: ProductPattern[] = ["multi-step-workflow", "form-submission"];
  if (categories.includes("monetization")) {
    patterns.push("destructive-action");
  }
  return mergeContract(patterns, ideaText);
}

export type InteractionContractMap = Record<string, InteractionContract>;

export type InteractionContractValidationResult = {
  valid: boolean;
  violations: string[];
};

/**
 * Structural completeness check: every named subject (a screen name, or a
 * workflow's `workflowContractKey`) must have a contract, and every
 * contract must declare at least one pattern and one required state. This
 * cannot yet verify a real implementation satisfies these states — that is
 * the Quality Gate's job (P2-10, extended at P2-EXIT) — but it guarantees
 * the *requirement* is recorded and cannot be silently dropped between
 * Blueprint generation and a later stage, for workflows exactly as much as
 * screens. Reused as-is by the Quality Gate and by conversational editing
 * (P2-08) to check a customer-modified Change Set has not silently dropped
 * a required state.
 */
export function validateInteractionContracts(
  subjects: readonly string[],
  contracts: InteractionContractMap,
): InteractionContractValidationResult {
  const violations: string[] = [];

  for (const subject of subjects) {
    const contract = contracts[subject];
    if (!contract) {
      violations.push(`"${subject}" has no interaction contract.`);
      continue;
    }
    if (contract.patterns.length === 0) {
      violations.push(`"${subject}"'s interaction contract has no recognized pattern.`);
    }
    if (contract.requiredStates.length === 0) {
      violations.push(`"${subject}"'s interaction contract has no required states.`);
    }
  }

  return { valid: violations.length === 0, violations };
}
