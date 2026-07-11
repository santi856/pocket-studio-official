import "server-only";

/**
 * The categories a change can affect (Master Spec §14). Phase 1 has no
 * generated workflows/screens/data models to analyze against yet (that is
 * Phase 2's Blueprint Engine output) — this is a deterministic, keyword-
 * based *foundation* that gives every request a structured impact shape,
 * to be replaced by real graph-based analysis over Product Knowledge
 * relationships once Phase 2 populates them.
 */
export type ImpactCategory =
  | "requirements"
  | "workflows"
  | "screens"
  | "actions"
  | "data"
  | "permissions"
  | "integrations"
  | "businessLogic"
  | "monetization"
  | "costs"
  | "security"
  | "privacy"
  | "governance"
  | "testing"
  | "launchStatus";

export type ImpactAnalysisResult = {
  categories: ImpactCategory[];
  /** True if this touches a Master Spec §4.2 consequential category. */
  consequential: boolean;
  rationale: string[];
};

// Master Spec §4.2 consequential categories, narrowed to the subset a
// keyword scan can plausibly detect in Phase 1 (payments/subscriptions,
// sensitive data, production/publishing actions). The remaining
// consequential categories (children, biometrics, health/finance/legal,
// etc.) require real product/business understanding this mock-era
// analyzer cannot provide — those surface later via the Requirements
// Engine and governance profile (P1-06/P1-08), not keyword matching.
const CONSEQUENTIAL_CATEGORIES: ReadonlySet<ImpactCategory> = new Set<ImpactCategory>([
  "monetization",
  "security",
  "privacy",
  "governance",
]);

const CATEGORY_KEYWORDS: Record<ImpactCategory, readonly string[]> = {
  requirements: ["require", "requirement", "must support", "should support"],
  workflows: ["workflow", "flow", "process", "step by step"],
  screens: ["screen", "page", "view", "ui"],
  actions: ["button", "action", "click", "submit", "tap"],
  data: ["data model", "database", "field", "record", "schema"],
  permissions: ["permission", "role", "access control", "who can"],
  integrations: ["integrate", "integration", "connect to", "webhook", "third-party", "api"],
  businessLogic: ["business rule", "logic", "calculation", "workflow rule"],
  monetization: [
    "payment",
    "deposit",
    "subscription",
    "pricing",
    "price",
    "membership",
    "billing",
    "charge",
    "fee",
    "refund",
  ],
  costs: ["cost", "expense", "budget", "margin"],
  security: ["password", "login", "authentication", "authorization", "security", "encrypt"],
  privacy: ["personal data", "pii", "privacy", "consent", "delete my data", "gdpr", "ccpa"],
  governance: ["compliance", "regulation", "legal", "policy", "terms of service", "law"],
  testing: ["test", "qa", "quality assurance"],
  launchStatus: ["launch", "deploy", "release", "publish", "go live", "submit to app store"],
};

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Plain substring matching false-positives on short keywords embedded in
 * unrelated words — e.g. "ui" inside "build" — so every keyword requires a
 * word boundary on its left edge. Deliberately *not* anchored on the right
 * too: that would miss ordinary inflections ("deposit" -> "deposits",
 * "membership" -> "memberships"), which matter more for this deterministic
 * foundation than the rarer risk of over-matching a suffix.
 */
function textContainsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}`, "i").test(text);
}

export function analyzeImpact(requestText: string): ImpactAnalysisResult {
  const categories: ImpactCategory[] = [];
  const rationale: string[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [ImpactCategory, readonly string[]]
  >) {
    const matched = keywords.find((keyword) => textContainsKeyword(requestText, keyword));
    if (matched) {
      categories.push(category);
      rationale.push(`Matched "${matched}" → ${category}`);
    }
  }

  const consequential = categories.some((category) => CONSEQUENTIAL_CATEGORIES.has(category));

  return { categories, consequential, rationale };
}
