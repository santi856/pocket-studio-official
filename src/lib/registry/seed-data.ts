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
    // P2-EXIT: was still SUPPORTED_LATER_PHASE even after Phase 2's
    // Blueprint Engine, Build Planner, Structured Renderer, and generation
    // pipeline (P2-01..P2-06) shipped and were independently reviewed —
    // this entry had gone stale, itself an instance of the "collapsed,
    // misleading status" gap this pass exists to close.
    capabilityKey: "generation.full_stack_web_app",
    label: "Generated, working full-stack web application from Product State",
    category: "generation",
    implementationLevel: "SUPPORTED_NOW",
    riskClass: "MEDIUM",
    limitations: [
      "Deterministic/template-based generation, not real AI-authored design — always disclosed via generationMetadata.",
      "The demonstration product's actual content is currently narrower than Master Spec §56's full stated vision for the exact required idea sentence (D-0028, D-0039) — real for every idea, but not yet as content-rich as the specification's own example.",
    ],
    outputTargets: ["web", "pwa"],
  },
  {
    // P2-EXIT: PROTOTYPE_ONLY, not SUPPORTED_LATER_PHASE — P2-15 genuinely
    // ships a real, working Expo project scaffold today (not merely
    // planned for later), but it is honestly a prototype: no interactive
    // runtime, syntax-only build validation, no real native build.
    capabilityKey: "generation.mobile_app",
    label: "Generated native iOS and Android application",
    category: "generation",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "MEDIUM",
    limitations: [
      "A real, working Expo/React Native project scaffold is generated (P2-15), but it is a static navigation-list prototype — no mobile equivalent of the web Structured Renderer/Interactive Runtime exists yet.",
      "Build validation is syntax-only (TypeScript parser); never a real native .ipa/.apk build (no Xcode/Android SDK in this environment).",
      "Production builds and store submission are Phase 3 scope (§61, §63).",
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
    // P2-EXIT: PROTOTYPE_ONLY, not SUPPORTED_LATER_PHASE — P2-11 genuinely
    // drafts 3 of Master Spec §34's 13 policy document types from real
    // Product State/Blueprint content today, not merely planned.
    capabilityKey: "governance.legal_document_drafts",
    label: "Drafted Terms of Service, Privacy Policy, and related policy documents",
    category: "governance",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "MEDIUM",
    limitations: [
      "Real content generators exist for only 3 of 13 PolicyDocumentType values (Terms of Service, Privacy Policy, AI Disclosure) — the other 10 have no generator yet.",
      "Every genuinely unknown fact (company identity, jurisdiction, contact) is left as a bracketed placeholder plus a recorded Open Question, never fabricated.",
      "No professional legal review workflow exists (§34's publication requirement) — drafts are generated only, never marked reviewed or published.",
    ],
  },
  {
    // R8/P2-EXIT: Master Spec §6's Simple Mode idea-entry surface and
    // AS-0001's own designated "first vertical proof." A real, working
    // Studio UI feature, not a generated-app capability — recorded here
    // (platform-wide Capability Registry) rather than per-project Truth
    // Status, since the picker itself is a fixed Pocket Studio feature, not
    // something that varies per customer project.
    capabilityKey: "studio.example_app_ideas_picker",
    label: "Example App Ideas picker on the idea-entry screen",
    category: "platform",
    implementationLevel: "SUPPORTED_NOW",
    riskClass: "LOW",
    evidenceStandard:
      "component test + real-browser e2e test (mouse, keyboard, touch, accessibility, recoverable-failure)",
    limitations: [
      "A fixed, hand-authored list of example ideas — not personalized or AI-suggested (real AI-backed suggestions are Phase 3 scope, §61).",
    ],
    outputTargets: ["web"],
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
