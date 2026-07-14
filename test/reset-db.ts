import { db } from "@/lib/db";

/**
 * Deletes in FK-dependency order (children before parents). Used between
 * integration tests so each test starts from a known-empty tenant state
 * instead of relying on unique-value gymnastics to avoid collisions.
 */
export async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetDatabase() must only run under NODE_ENV=test.");
  }

  await db.session.deleteMany();
  // Not a User relation (see the LoginAttempt model comment,
  // prisma/schema.prisma), so not covered by User's cascade below.
  await db.loginAttempt.deleteMany();
  // Project cascades to ProductState, ProductDNA, ProductMemoryEntry,
  // ProductKnowledgeNode/Edge, Decision, ProductEvent, ProductEvidence,
  // TruthStatusEntry, IntegrationRequirement (-> CredentialReference),
  // GovernanceProfile, PolicyDocument, OAuthConnectionState, Deployment,
  // and ExportRecord — no need to delete those separately. Organization
  // cascades to OrganizationSubscription (-> BillingEvent).
  await db.project.deleteMany();
  await db.membership.deleteMany();
  await db.organization.deleteMany();
  await db.user.deleteMany();
  // Not project- or organization-scoped (platform-wide registries), so
  // not covered by the cascades above.
  await db.capabilityRegistryEntry.deleteMany();
  await db.planDefinition.deleteMany();
  // Not a relation of anything else — identified only by its own
  // (provider, providerEventId) pair, so not covered by any cascade above.
  await db.processedWebhookEvent.deleteMany();
  // userId is a plain correlation field, not a `@relation` (see the
  // SentEmail model comment, prisma/schema.prisma) — not covered by
  // User's cascade above.
  await db.sentEmail.deleteMany();
}
