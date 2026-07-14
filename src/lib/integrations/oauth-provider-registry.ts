import "server-only";
import type { OAuthProviderConfig } from "./oauth";

/**
 * No concrete third-party OAuth provider has been selected for Pocket
 * Studio to support yet — which specific services (Google, GitHub,
 * Stripe Connect, etc.) to integrate first is a product decision, not
 * something to invent here. This registry is the real extension point:
 * add an entry keyed by IntegrationRequirement.selectedProvider, sourced
 * from its own optional env vars (same fail-open-until-configured pattern
 * as AI_PROVIDER/BILLING_PROVIDER), once a specific provider is chosen.
 * Empty today is the honest state, not a placeholder to fill in blindly.
 */
const PROVIDER_REGISTRY: Readonly<Record<string, OAuthProviderConfig | undefined>> = {};

export function getOAuthProviderConfig(providerName: string): OAuthProviderConfig | null {
  return PROVIDER_REGISTRY[providerName] ?? null;
}
