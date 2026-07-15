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
    // P3-06: a real charge-creation mechanism now exists
    // (createGeneratedAppCharge, src/lib/generation/generated-app-payments.ts)
    // -- charges against the customer's own connected payment-provider
    // account (via P3-05's OAuth connection), real GeneratedAppPayment
    // records for every attempt including declines. Still PROTOTYPE_ONLY,
    // not SUPPORTED_NOW: no generated-app checkout UI calls it yet (P2-05's
    // renderer was never extended to), and no client-side card
    // tokenization exists to produce a real paymentMethodToken.
    capabilityKey: "payments.deposits",
    label: "Appointment deposit collection",
    category: "monetization",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "HIGH",
    requiredIntegrations: ["customer-owned payment provider (e.g. Stripe)"],
    limitations: [
      "Real charge creation exists (P3-06) against the customer's own connected account, tested with a mocked provider response -- but no generated-app checkout UI calls it yet (the Structured Renderer/Interactive Runtime, P2-05, was never extended to), and no client-side card-tokenization flow exists to produce a real payment method token, so no live charge has ever been attempted end to end.",
    ],
  },
  {
    // P3-06: the same createGeneratedAppCharge mechanism supports a
    // recurring charge exactly as it supports a one-time deposit -- no
    // separate subscription-specific code exists (or is needed) at the
    // charge layer; what's still entirely missing is real recurrence
    // (a schedule that re-invokes it), which needs the same scheduled-job
    // infrastructure already disclosed as missing for P3-04's time-based
    // billing transitions.
    capabilityKey: "payments.subscriptions",
    label: "Recurring membership/subscription billing",
    category: "monetization",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "HIGH",
    requiredIntegrations: ["customer-owned payment provider (e.g. Stripe)"],
    limitations: [
      "A single charge can be created for real (P3-06, payments.deposits) against a customer's connected account, but nothing schedules or repeats it -- this codebase has no scheduled-job infrastructure at all yet (the same gap already disclosed for P3-04's time-based billing transitions), so recurring billing itself remains not yet real.",
    ],
  },
  {
    // P3-01: a real Anthropic connection now exists and is wired into
    // intent resolution (AIProvider.resolveIntent, real API call with
    // forced tool-use for a structurally guaranteed response, active only
    // when AI_PROVIDER=anthropic and a real key is configured). This
    // capability key specifically covers full AI-model-backed *product*
    // generation (Blueprint/Build Plan content) -- that remains the
    // deterministic template pipeline from Phase 2 (blueprint-generator.ts
    // never calls AIProvider); genuinely not yet real, so this stays
    // SUPPORTED_LATER_PHASE rather than being overstated.
    capabilityKey: "ai.live_provider_generation",
    label: "Real AI-model-backed product generation",
    category: "ai",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "MEDIUM",
    limitations: [
      "A real Anthropic provider connection exists (P3-01, src/lib/ai/anthropic-provider.ts) and is wired into intent resolution, but Blueprint/Build Plan generation (the actual product content) is still the deterministic template pipeline from Phase 2 -- see ai.live_provider_intent_resolution for what is real today.",
    ],
  },
  {
    capabilityKey: "ai.live_provider_intent_resolution",
    label: "Real AI-backed intent classification (describe_idea / edit_request / unclear)",
    category: "ai",
    // Real, working code exists and is fully tested (mocked-fetch unit
    // tests verifying request shape, response parsing, and every error
    // path) -- but its only live exercise path requires a real
    // ANTHROPIC_API_KEY this environment does not have configured
    // (AI_PROVIDER defaults to mock), so it has never been proven against
    // Anthropic's actual API. PROTOTYPE_ONLY, not SUPPORTED_NOW, per this
    // project's own standard for "real code, unproven against the real
    // external system."
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "MEDIUM",
    requiredIntegrations: ["ANTHROPIC_API_KEY (platform-level, not customer-owned)"],
    limitations: [
      "Implemented and unit-tested against a mocked Anthropic API response, but never exercised against the real Anthropic API in this environment -- no ANTHROPIC_API_KEY is configured. Set AI_PROVIDER=anthropic and a real key to activate it; MockAIProvider remains the default and requires no credentials.",
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
    // P3-09: a real submission-workflow state machine
    // (src/lib/generation/store-submissions.ts) -- connectDeveloperAccount
    // (reuses the P3-05 credential vault), createStoreSubmission (real
    // preconditions: connected developer account, validated mobile
    // scaffold, both policy documents), advanceStoreSubmissionReview, and
    // releaseStoreSubmission. Still EXTERNAL_APPROVAL_REQUIRED, not
    // upgraded: no real Apple/Google API call is ever made (StoreReviewProvider
    // has only a mock implementation) and Master Spec §44 itself requires
    // real human customer approval before any real submission regardless
    // of how much of the workflow around it is genuinely implemented.
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
      "Developer-account connection (storing an App Store Connect API key or Play Console service-account credential) and the submission status workflow (in review, approved, rejected with a real reason, released) are real and tested -- but no real Apple/Google API is ever called. StoreReviewProvider has only a mock implementation, honestly disclosed the same way as DeploymentProvider (P3-08): no live review has ever been attempted.",
      "No real native .ipa/.apk build exists (mobile.ts, P2-15, produces a syntax-validated Expo scaffold, not a signed binary) -- a submission's version/buildNumber are recorded as real facts but nothing is actually compiled or code-signed.",
    ],
  },
  {
    // P3-03/P3-04: entitlement enforcement and webhook/reconciliation
    // infrastructure are now real (see the two entries below) -- but a
    // customer still cannot actually pay Pocket Studio money (no checkout
    // flow exists to create a real billing-provider customer/subscription
    // in the first place), so the umbrella "can subscribe and pay"
    // capability honestly stays SUPPORTED_LATER_PHASE.
    capabilityKey: "billing.pocket_studio_subscription",
    label: "Pocket Studio's own paid subscription plans",
    category: "platform-billing",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "MEDIUM",
    limitations: [
      "Entitlement enforcement, the billing state machine, and webhook/portal/reconciliation infrastructure are real (P3-03, P3-04) -- but no checkout flow exists yet to create a real billing-provider customer, so no customer can actually subscribe and pay yet.",
    ],
  },
  {
    // Real and always active regardless of BILLING_PROVIDER -- project
    // limits and export gating are enforced deterministically from the
    // Plan Registry, not dependent on a live Stripe connection.
    capabilityKey: "billing.entitlement_enforcement",
    label: "Real plan-entitlement enforcement (project limits, export gating)",
    category: "platform-billing",
    implementationLevel: "SUPPORTED_NOW",
    riskClass: "LOW",
    limitations: [
      "Only projectLimit and exportAllowed are enforced today; storageMb has no real metering behind it (no blob/byte tracking exists), and teamSeats/deploymentAllowed have no feature to enforce against yet (no team-invitation or deployment feature exists in this codebase).",
    ],
  },
  {
    // P3-04: real webhook signature verification (Stripe's own documented
    // HMAC-SHA256 scheme, implemented and unit-tested against
    // self-constructed valid/invalid signatures), idempotent event
    // processing, and a real billing-provider connection (portal
    // sessions, subscription-status reconciliation) -- but never
    // exercised against the real Stripe API, since no STRIPE_SECRET_KEY
    // is configured in this environment. PROTOTYPE_ONLY, matching the
    // same honest bar P3-01 set for the Anthropic connection.
    capabilityKey: "billing.webhook_processing",
    label: "Real Stripe webhook verification, portal sessions, and reconciliation",
    category: "platform-billing",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "MEDIUM",
    requiredIntegrations: [
      "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (platform-level, not customer-owned)",
    ],
    limitations: [
      "Implemented and tested (real HMAC signature construction/verification, mocked-fetch portal/reconciliation requests) but never exercised against the real Stripe API in this environment -- no STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET is configured. Set BILLING_PROVIDER=stripe and both real keys to activate it; MockBillingProvider remains the default and requires no credentials. No checkout flow exists yet to link a real customer, so even with real keys configured, no organization has a billing-provider customer id to test against live.",
      "Only 3 of the 8 BillingLifecycleEvent transitions (src/lib/billing/access.ts) are wired to real webhook triggers today: PAYMENT_FAILED, PAYMENT_RECOVERED, and CANCEL_REQUESTED (from invoice.payment_failed/succeeded and customer.subscription.deleted). PAYMENT_RETRY_EXHAUSTED, GRACE_PERIOD_EXPIRED, RESTRICTION_ESCALATED, RETENTION_PERIOD_EXPIRED, and DELETION_EXECUTED are time-based, not event-based, and require scheduled-job infrastructure this codebase does not have yet (the same disclosed gap as P2-13's orphaned durable jobs) -- reachable only via the manual, OWNER-driven transitionBillingState today, never automatically.",
      "invoice.payment_succeeded fires on every successful invoice charge, not just failure recovery -- overwhelmingly the ordinary renewal of an already-ACTIVE subscription. processBillingWebhook treats this as a real no-op (durably recorded for idempotency, no BillingEvent transition) rather than an error when there is nothing to recover from; only a genuine failure-adjacent-state recovery actually transitions billingState (Level 3 review round 1, DEFECT 1, fixed in D-0062/EV-0107).",
      "The no-op above applies uniformly to every state PAYMENT_RECOVERED has no defined transition from -- not only the common, benign ACTIVE/TRIALING renewal case, but also a payment succeeding for an organization already CANCELED/EXPIRED/RETENTION_PERIOD/DELETION_SCHEDULED/DELETED. The latter is a genuine anomaly (a billing-provider/application desync, or a customer charged after cancellation) that currently leaves no trace beyond the raw ProcessedWebhookEvent idempotency row -- no BillingEvent, no AuditLogEntry, no alert (Level 3 review round 2, finding 1, disclosed not yet resolved with a distinguishing signal).",
    ],
  },
  {
    // P3-05: a real, generic OAuth2 authorization-code flow (state
    // generation/verification, single-use replay protection, real token
    // exchange, storage through the existing credential vault) -- but no
    // concrete third-party provider (Google, GitHub, Stripe Connect,
    // etc.) has been selected for Pocket Studio to support yet, so the
    // provider registry (src/lib/integrations/oauth-provider-registry.ts)
    // is genuinely empty. PROTOTYPE_ONLY: real, tested infrastructure
    // with no live provider instantiated, same honest bar as P3-01/P3-04.
    capabilityKey: "integrations.oauth_connections",
    label: "Customer-owned integration connections via OAuth2",
    category: "integrations",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "MEDIUM",
    limitations: [
      "The flow itself (CSRF-safe state, single-use replay protection, real token exchange, credential-vault storage) is implemented and integration-tested against a real database with mocked provider HTTP responses. No concrete provider is registered -- which third-party services to support first is a product decision, not invented here -- so no customer can complete a real connection today.",
      "No Studio UI page exists yet to browse or manage a project's IntegrationRequirements at all (a pre-existing Phase 1 gap, not new to this unit) -- the flow is reachable via its real, live Route Handler (/api/integrations/oauth/callback) and service functions, not yet from any customer-facing page.",
      "Token refresh is not implemented -- getConnectedTokenSet returns whatever was stored at connection time, including an expired token, without attempting to use a stored refresh_token to obtain a new one.",
    ],
  },
  {
    // P3-07: a real SMTP client (RFC 5321, implemented directly over
    // node:tls -- no library dependency) plus a real transactional
    // trigger (a welcome email on every real sign-up, wired into
    // signUpAction). Every send attempt is durably recorded (SentEmail),
    // sent or failed. PROTOTYPE_ONLY: real and tested against a fully
    // scripted fake SMTP conversation, never exercised against a real
    // mail server, since no SMTP_HOST/credentials are configured here.
    capabilityKey: "platform.production_email",
    label: "Real transactional email sending",
    category: "platform",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "LOW",
    limitations: [
      "Implemented and tested (a real SMTP client speaking the actual protocol against a fully scripted fake connection: greeting, EHLO, AUTH LOGIN, MAIL FROM/RCPT TO/DATA, and every real failure path) but never exercised against a real mail server in this environment -- no SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD/EMAIL_FROM_ADDRESS is configured. Set EMAIL_PROVIDER=smtp and all five values to activate it; MockEmailProvider remains the default and requires no credentials.",
      "Only one transactional trigger exists today: a welcome email on sign-up. No password-reset flow exists in this codebase yet to trigger a reset email, and no other lifecycle notification (billing/entitlement events already generated this phase, governance changes, etc.) is wired to send an email yet.",
      "AUTH LOGIN only, and implicit TLS only (no STARTTLS negotiation) -- a disclosed, deliberate scope limit for a V1 client speaking to one already-configured server, not a universal SMTP client.",
    ],
  },
  {
    // P3-08: a real Deployment record-keeping and rollback state machine
    // (createDeployment/getActiveDeployment/rollbackDeployment) -- tested
    // and correct independent of which provider performs the underlying
    // push. PROTOTYPE_ONLY, not SUPPORTED_LATER_PHASE, because this half
    // (evidence + rollback) is genuinely real today, unlike the hosting
    // push itself (see platform.deployment_hosting).
    capabilityKey: "platform.deployment_evidence_and_rollback",
    label: "Deployment record-keeping, evidence, and rollback",
    category: "platform",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "LOW",
    limitations: [
      "Every deployment attempt (succeeded or failed) is durably recorded, mirrored into the Evidence Ledger and Truth Status, and can be rolled back to the prior successful deployment for the same environment -- all tested against the real service functions and a real Postgres database, not exercised against a live hosting provider.",
      "Production deployments require the Quality Gate (quality.gate Truth Status) to currently read IMPLEMENTED; development/preview/staging do not.",
      "Rollback only reverts Pocket Studio's own deployment record and marks the prior one active again -- it does not (and, with only a mock provider, cannot) re-push any bytes to a real host.",
    ],
  },
  {
    // No hosting vendor is named anywhere in Master Spec (unlike
    // payments, where "e.g. Stripe" was already a named illustrative
    // example in this codebase's own seed data) -- picking one (Vercel,
    // Netlify, AWS, etc.) here would be an unauthorized product decision
    // this build has no authority to make. SUPPORTED_LATER_PHASE, not
    // PROTOTYPE_ONLY: unlike every other provider abstraction this phase
    // (AI/billing/payments/email), there is no real implementation at all
    // here yet, mock-only.
    capabilityKey: "platform.deployment_hosting",
    label: "Deployment to a real hosting provider",
    category: "platform",
    implementationLevel: "SUPPORTED_LATER_PHASE",
    riskClass: "LOW",
    limitations: [
      "DeploymentProvider has only a mock implementation -- MockDeploymentProvider always succeeds (for valid Blueprint/Build Plan versions) without ever pushing any bytes anywhere. No real hosting vendor is implemented or named.",
      "Development, Preview, Staging, and Production are modeled as an environment field on each Deployment record; there is no separate environment-configuration entity (secrets per environment, custom domains, etc.).",
    ],
  },
  {
    // P3-11: real audit logging (credential store/access, member-driven
    // billing state transitions -- all tested against a real Postgres
    // database), real AI cost tracking (actual token counts from a real
    // Anthropic response, never estimated), and a real incident-response
    // state machine. PROTOTYPE_ONLY: genuinely implemented and tested,
    // but with real, disclosed gaps below rather than a complete
    // observability platform.
    capabilityKey: "platform.observability",
    label: "Audit logs, AI cost tracking, and incident response",
    category: "platform",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "LOW",
    limitations: [
      "Audit logging covers 3 real, security-sensitive actions (credential stored, credential accessed, member-driven billing state transition) -- not a comprehensive audit of every sensitive action in the codebase. Viewing an organization's audit trail requires ADMIN role.",
      "AI cost tracking records real, exact token counts from every live Anthropic API call (never estimated) -- but a dollar cost is only computed once an operator configures a real, current per-token rate (AI_COST_PER_1K_INPUT_TOKENS_CENTS/AI_COST_PER_1K_OUTPUT_TOKENS_CENTS); this build never hardcodes a rate it cannot verify is current. Mock-mode AI calls record no usage event at all, by design -- there is no real cost to report.",
      "Incident response is a real, tested state machine (OPEN -> INVESTIGATING -> RESOLVED, requiring a real root cause and remediation to resolve) but has no live monitoring/alerting integration -- no vendor is named or authorized; an incident is recorded only once a real human operator has identified one. No customer-facing incident status page exists.",
      "No platform-wide analytics/monitoring dashboard exists in the Studio UI yet -- this is real, queryable service-layer infrastructure (getAiUsageSummary, listAuditLogEntries, listIncidents), not yet a rendered page.",
    ],
  },
  {
    // P3-12: real aggregation of what earlier Phase 3 units already
    // record (product analytics) plus a deterministic, rule-based health
    // assessment against real billing/Quality-Gate/deployment/submission
    // state (business health) -- no new tracking mechanism, no AI-
    // generated business advice.
    capabilityKey: "platform.product_and_business_analytics",
    label: "Product and business analytics, grounded business-health recommendations",
    category: "platform",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "LOW",
    limitations: [
      "Product analytics (getProductAnalyticsSnapshot) is a real-time aggregation of already-recorded facts (generated-app users/records, payment outcomes, deployment outcomes by environment, latest store submission per platform, Truth Status coverage) -- not a historical trend/time-series view; every call recomputes from current state.",
      "Business-health assessment (assessBusinessHealth) checks 4 real, bounded conditions (billing state, Quality Gate status, recent deployment failure rate, latest store submission rejections) with a fixed, pre-written recommendation template per condition -- deliberately not an AI-generated opinion, and not a comprehensive business-intelligence system. It never invents a spend threshold or budget signal that was not actually configured.",
      "Business-health is project-scoped (recorded as real Evidence/Truth Status, subjectKey business.health), not a rolled-up organization-wide score across every project -- ProductEvidence/TruthStatusEntry are both project-scoped by design.",
      "No Studio UI page yet renders any of these snapshots or recommendations -- reachable only from the real, tested service layer, the same disclosed pre-Studio-UI pattern already present for several other P3 units this phase.",
    ],
  },
  {
    // P3-13: a real, auditable platform-admin grant (PlatformAdmin --
    // who, by whom, when, any revocation) and requirePlatformAdmin, a
    // genuine second authorization root alongside
    // requireProjectAccess/requireOrganizationMembership. Closes a real,
    // previously-disclosed gap: several P3-10/P3-11 operator-only
    // functions (recordGovernanceRequirement, createGovernanceImpactAssessment,
    // notifyCustomerOfGovernanceImpact, dismissGovernanceImpactAssessment,
    // reportIncident, beginIncidentInvestigation, resolveIncident,
    // listIncidents) had genuinely no authorization check at all until
    // this unit wired requirePlatformAdmin into every one of them.
    capabilityKey: "platform.internal_administrative_operations",
    label: "Platform-admin authorization, cross-tenant support visibility",
    category: "platform",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "MEDIUM",
    limitations: [
      "The very first platform administrator is bootstrapped by any authenticated user calling grantPlatformAdmin while zero active admins exist -- the standard 'first user becomes admin' pattern. Once at least one active admin exists, only an existing admin may grant another. No separate out-of-band verification (e.g. a signed invitation link) exists for this bootstrap step.",
      "listAllOrganizations/getPlatformOverview are real, tested, admin-gated cross-tenant reads -- but no Studio UI page renders them yet, and there is no support-impersonation ('view as this customer') workflow.",
      "getPlatformOverview's AI cost total is null unless an operator has configured a real per-token rate (P3-11) -- the same 'never fabricate a cost' discipline applied there.",
      "Revoking the last remaining active admin is refused (LastPlatformAdminError) to prevent the platform from having zero administrators -- there is no recovery path other than direct database access if this were ever somehow bypassed.",
    ],
  },
  {
    // P3-14, the final Phase 3 implementation unit: (1) ProductOutcomeRecord
    // ties real outcome facts to the existing Product Knowledge Graph
    // (P1-x, §12) and gives P3-12's real-time-only analytics a real
    // historical record. (2) proposeContinuousProductRecommendations
    // reuses assessBusinessHealth's deterministic findings (P3-12) and
    // only ever creates a CONSEQUENTIAL, PENDING_APPROVAL Decision Ledger
    // entry -- never AI-generated, never auto-applied, never runs on any
    // schedule (no scheduled-job infrastructure exists, the same
    // disclosed gap already noted for P3-04's time-based billing
    // transitions).
    capabilityKey: "platform.product_outcome_and_continuous_agent_foundation",
    label: "Product Outcome foundation + bounded Continuous Product Agent foundation",
    category: "platform",
    implementationLevel: "PROTOTYPE_ONLY",
    riskClass: "LOW",
    limitations: [
      "This is explicitly a *foundation*, not the mature Product Outcome Graph Master Spec §48 describes as 'Maximum Vision' -- outcome facts are simple (metricKey, value, source) rows, optionally linked to one knowledge-graph node, not a rich outcome model.",
      "proposeContinuousProductRecommendations must be called explicitly -- there is no live, autonomous loop that runs it continuously or on any schedule. It never changes prices, refunds, policies, or production behavior itself, and never updates a Decision's approvalStatus -- a human must still explicitly approve or reject every proposal it creates.",
      "Deduplication only prevents re-proposing an identical finding while an earlier proposal for it is still PENDING_APPROVAL -- once that decision is approved or rejected, a recurring finding will be proposed again on the next call.",
      "No Studio UI page yet renders outcome history or agent-proposed decisions -- reachable only from the real, tested service layer, the same disclosed pre-Studio-UI pattern already present for several other P3 units this phase.",
    ],
  },
] as const;

export async function seedCapabilityRegistry(actorUserId?: string): Promise<void> {
  for (const definition of INITIAL_CAPABILITIES) {
    await upsertCapabilityVersion(definition, actorUserId);
  }
}
