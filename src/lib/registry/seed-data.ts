import "server-only";
import { upsertCapabilityVersion } from "@/lib/registry/capability-registry";
import type { CapabilityDefinition } from "@/lib/registry/capability-registry";

/**
 * Initial Supported Capability Registry content, deliberately truthful
 * about Phase 1 status. Capabilities Phase 1 actually implements (auth,
 * tenancy) are SUPPORTED_NOW; everything the Master Spec explicitly defers
 * to Phase 2 (§52) or Phase 3 (§58, §65) is SUPPORTED_LATER_PHASE or
 * EXTERNAL_APPROVAL_REQUIRED — never overstated as available today.
 */
export const INITIAL_CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    capabilityKey: "auth.email_password",
    label: "Email and password authentication with hashed, session-based login",
    category: "platform",
    implementationLevel: "SUPPORTED_NOW",
    riskClass: "LOW",
    evidenceStandard: "integration test against a real database",
    outputTargets: ["web"],
  },
  {
    capabilityKey: "tenancy.organizations_and_projects",
    label: "Multi-tenant organizations, memberships, and projects with enforced isolation",
    category: "platform",
    implementationLevel: "SUPPORTED_NOW",
    riskClass: "LOW",
    evidenceStandard: "integration test against a real database",
    outputTargets: ["web"],
  },
  {
    capabilityKey: "generation.full_stack_web_app",
    label: "Generated, working full-stack web application from Product State",
    category: "generation",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "MEDIUM",
    limitations: [
      "Blueprint Engine, Build Planner, and generation are Phase 2 scope (Master Spec §54-59).",
    ],
    outputTargets: ["web", "pwa"],
  },
  {
    capabilityKey: "generation.mobile_app",
    label: "Generated native iOS and Android application",
    category: "generation",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "MEDIUM",
    limitations: [
      "Mobile generation is Phase 2 scope (§55); production builds/store submission are Phase 3 (§61, §63).",
    ],
    outputTargets: ["ios", "android"],
  },
  {
    capabilityKey: "payments.deposits",
    label: "Appointment deposit collection",
    category: "monetization",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "HIGH",
    requiredIntegrations: ["customer-owned payment provider (e.g. Stripe)"],
    limitations: [
      "Payment architecture generation is Phase 2 (§55); live production charges are Phase 3 (§61).",
    ],
  },
  {
    capabilityKey: "payments.subscriptions",
    label: "Recurring membership/subscription billing",
    category: "monetization",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "HIGH",
    requiredIntegrations: ["customer-owned payment provider (e.g. Stripe)"],
    limitations: [
      "Subscription architecture generation is Phase 2 (§55); live billing is Phase 3 (§61).",
    ],
  },
  {
    capabilityKey: "ai.live_provider_generation",
    label: "Real AI-model-backed product generation",
    category: "ai",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "MEDIUM",
    limitations: [
      "Real server-side AI provider connections are Phase 3 scope (§61); Phase 1-2 use the deterministic mock provider.",
    ],
  },
  {
    capabilityKey: "governance.legal_document_drafts",
    label: "Drafted Terms of Service, Privacy Policy, and related policy documents",
    category: "governance",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "MEDIUM",
    limitations: [
      "Requires real Product State and business details to reflect accurately, and professional review before publication (§34).",
    ],
  },
  {
    capabilityKey: "distribution.apple_google_submission",
    label: "App Store and Google Play submission",
    category: "distribution",
    implementationLevel: "EXTERNAL_APPROVAL_REQUIRED",
    riskClass: "HIGH",
    requiredIntegrations: [
      "customer-owned Apple Developer account",
      "customer-owned Google Play account",
    ],
    limitations: [
      "Requires customer-owned developer accounts and actual platform review; Pocket Studio cannot guarantee approval (§43, §44).",
    ],
  },
  {
    capabilityKey: "billing.pocket_studio_subscription",
    label: "Pocket Studio's own paid subscription plans",
    category: "platform-billing",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "MEDIUM",
    limitations: [
      "Live Pocket Studio billing, entitlements, and webhooks are Phase 3 scope (§62).",
    ],
  },
] as const;

export async function seedCapabilityRegistry(actorUserId?: string): Promise<void> {
  for (const definition of INITIAL_CAPABILITIES) {
    await upsertCapabilityVersion(definition, actorUserId);
  }
}
