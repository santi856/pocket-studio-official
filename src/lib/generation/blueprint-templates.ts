import "server-only";
import type { ImpactCategory } from "@/lib/orchestration/impact-analysis";

export type BlueprintCategoryTemplate = {
  workflow?: { name: string; steps: string[] };
  screens?: string[];
  actions?: string[];
  dataModel?: { name: string; fields: string[] };
  permission?: string;
  businessRule?: string;
  monetization?: string;
};

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
    actions: ["Submit"],
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
    actions: ["Pay"],
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
