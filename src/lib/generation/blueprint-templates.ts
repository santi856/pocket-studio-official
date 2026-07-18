import "server-only";
import type { ImpactCategory } from "@/lib/orchestration/impact-analysis";

// Stage 3 D-0081 (STAGE_2_ARCHITECTURE_PROPOSAL.md §10.1): an action entry
// may optionally carry which screen it appears on and which workflow it
// triggers, feeding the Graph Projector's CONTAINS/TRIGGERS edge
// derivation — additive and backward-compatible (a bare string remains
// valid via this union), so every entry below not explicitly updated
// continues to behave exactly as before. `onScreen`/`triggersWorkflow`
// values are validated at build time (blueprint-templates.test.ts) against
// every `screens`/`workflow.name` declared anywhere in this file, catching
// a real authoring typo deterministically — see §10.1 for why this is
// deliberately NOT enforced as a same-category-entry-only rule (most real
// pairings are legitimately cross-category, since only the `workflows`
// category ever declares a workflow name).
export type BlueprintCategoryAction =
  string | { name: string; onScreen?: string; triggersWorkflow?: string };

export type BlueprintCategoryTemplate = {
  workflow?: { name: string; steps: string[] };
  screens?: string[];
  actions?: BlueprintCategoryAction[];
  dataModel?: { name: string; fields: string[] };
  permission?: string;
  businessRule?: string;
  monetization?: string;
};

export function actionName(action: BlueprintCategoryAction): string {
  return typeof action === "string" ? action : action.name;
}

/**
 * Deterministic, template-based Blueprint content keyed off the same Impact
 * Analysis categories the Requirements Engine (P1-06) already derives from a
 * customer's idea. This is explicitly not real design intelligence — it
 * turns already-detected categories into a structurally valid Blueprint,
 * honestly labeled via `generationMetadata` and never presented as
 * AI-authored design. Real AI-backed generation is Phase 3 scope (Master
 * Spec §61).
 */
export const BLUEPRINT_CATEGORY_TEMPLATES: Partial<
  Record<ImpactCategory, BlueprintCategoryTemplate>
> = {
  workflows: {
    workflow: {
      name: "Primary Workflow",
      steps: ["Start", "Provide details", "Review", "Confirm", "Complete"],
    },
  },
  screens: {
    screens: ["Browse"],
  },
  actions: {
    actions: [{ name: "Submit", triggersWorkflow: "Primary Workflow" }],
  },
  data: {
    dataModel: { name: "Record", fields: ["id", "status", "createdAt"] },
  },
  permissions: {
    permission: "Restrict owner-only actions to the owner role.",
  },
  integrations: {
    actions: ["Connect integration"],
    permission: "Require an authenticated session before connecting a third-party integration.",
  },
  businessLogic: {
    businessRule: "Apply the customer-described business rule during processing.",
  },
  monetization: {
    screens: ["Checkout"],
    actions: [{ name: "Pay", onScreen: "Checkout" }],
    dataModel: { name: "Payment", fields: ["id", "amountCents", "status", "createdAt"] },
    monetization: "Collect payment as part of the primary workflow.",
  },
  security: {
    permission: "Require authentication for actions that modify data.",
  },
  privacy: {
    businessRule: "Handle personal data according to the stated privacy intent.",
  },
};

export const BASE_SCREENS = ["Home"] as const;
export const CUSTOMER_ROLE = "customer";
export const OWNER_ROLE = "owner";
