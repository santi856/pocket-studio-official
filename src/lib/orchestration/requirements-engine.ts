import { analyzeImpact } from "@/lib/orchestration/impact-analysis";
import type { ImpactCategory } from "@/lib/orchestration/impact-analysis";

export type RequirementBasis = "explicit" | "inferred" | "recommended";

export type DerivedRequirement = {
  statement: string;
  basis: RequirementBasis;
  category: ImpactCategory;
};

// Master Spec §17: distinguish explicit, inferred, recommended, and
// optional requirements. Every category detected by Impact Analysis
// becomes an INFERRED requirement (the customer's words implied it, we
// didn't ask); the base web-generation requirement is always RECOMMENDED
// (Pocket Studio's default, not something the customer said).
const REQUIREMENT_TEMPLATES: Record<ImpactCategory, string> = {
  requirements: "Capture and track explicit product requirements as they are described.",
  workflows: "Support the customer-described step-by-step workflow.",
  screens: "Provide dedicated screens for the flows the customer described.",
  actions: "Support the specific user actions the customer described.",
  data: "Persist the data records the customer described.",
  permissions: "Enforce role-based access control for the described capability.",
  integrations: "Connect to the third-party service the customer described.",
  businessLogic: "Implement the business rule the customer described.",
  monetization: "Support the payment or billing behavior the customer described.",
  costs: "Track the cost or budget concern the customer described.",
  security: "Implement the authentication/authorization behavior the customer described.",
  privacy:
    "Handle the personal-data behavior the customer described in compliance with stated intent.",
  governance: "Address the compliance/legal concern the customer described.",
  testing: "Cover the described behavior with automated tests.",
  launchStatus: "Prepare the described behavior for launch readiness review.",
};

const TARGET_CUSTOMER_PATTERN = /\bfor\s+(.+?)(?:[.!?]|$)/i;

/**
 * Best-effort, deterministic — not language understanding. Looks for the
 * literal pattern "... for <audience>" (e.g. "booking app for mobile
 * detailers"). Anything more sophisticated requires real AI, which is
 * explicitly Phase 3 scope (Master Spec §61); this must never be
 * represented as more than what it is.
 */
export function extractTargetCustomer(rawIdea: string): string | null {
  const match = rawIdea.match(TARGET_CUSTOMER_PATTERN);
  return match?.[1]?.trim() || null;
}

export function deriveRequirements(rawIdea: string): DerivedRequirement[] {
  const { categories } = analyzeImpact(rawIdea);

  const requirements: DerivedRequirement[] = categories.map((category) => ({
    statement: REQUIREMENT_TEMPLATES[category],
    basis: "inferred",
    category,
  }));

  requirements.push({
    statement: "Generate a responsive web application from the described product.",
    basis: "recommended",
    category: "screens",
  });

  return requirements;
}

export function deriveOpenQuestions(rawIdea: string, requirements: DerivedRequirement[]): string[] {
  const openQuestions: string[] = [];

  if (!extractTargetCustomer(rawIdea)) {
    openQuestions.push("Who is the primary target customer for this product?");
  }
  if (!requirements.some((requirement) => requirement.category === "monetization")) {
    openQuestions.push("How should this product generate revenue, if at all?");
  }
  if (!requirements.some((requirement) => requirement.category === "permissions")) {
    openQuestions.push("Does this product need more than one user role (e.g. customer vs. owner)?");
  }

  return openQuestions;
}

// Category → candidate Supported Capability Registry keys. Only maps to
// keys that actually exist in src/lib/registry/seed-data.ts — inventing a
// plausible-sounding key here would let a nonexistent capability slip past
// Feasibility, which is exactly what the registry exists to prevent.
const CATEGORY_TO_CAPABILITY_KEYS: Partial<Record<ImpactCategory, readonly string[]>> = {
  monetization: ["payments.deposits", "payments.subscriptions"],
  governance: ["governance.legal_document_drafts"],
  privacy: ["governance.legal_document_drafts"],
};

export function suggestCapabilityKeys(requirements: DerivedRequirement[]): string[] {
  const keys = new Set<string>(["generation.full_stack_web_app"]);

  for (const requirement of requirements) {
    const mapped = CATEGORY_TO_CAPABILITY_KEYS[requirement.category];
    mapped?.forEach((key) => keys.add(key));
  }

  return Array.from(keys);
}
