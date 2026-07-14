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
  // AuditLogEntry/AiUsageEvent use onDelete: SetNull on organizationId
  // (deliberately, so a real audit/cost record survives organization
  // deletion) — not covered by Organization's cascade below, so deleted
  // explicitly here instead.
  await db.auditLogEntry.deleteMany();
  await db.aiUsageEvent.deleteMany();
  // Project cascades to ProductState, ProductDNA, ProductMemoryEntry,
  // ProductKnowledgeNode/Edge (-> ProductOutcomeRecord), Decision,
  // ProductEvent, ProductEvidence, TruthStatusEntry, IntegrationRequirement
  // (-> CredentialReference), GovernanceProfile, PolicyDocument (->
  // PolicyAcceptance), OAuthConnectionState, Deployment, ExportRecord,
  // StoreSubmission, GovernanceImpactAssessment, and ProductOutcomeRecord
  // (also directly, for records with no knowledgeNodeId) — no need to
  // delete those separately. Organization cascades to
  // OrganizationSubscription (-> BillingEvent).
  await db.project.deleteMany();
  await db.membership.deleteMany();
  await db.organization.deleteMany();
  // User cascades to PlatformAdmin — no need to delete separately.
  await db.user.deleteMany();
  // Not project- or organization-scoped (platform-wide registries), so
  // not covered by the cascades above.
  await db.capabilityRegistryEntry.deleteMany();
  await db.planDefinition.deleteMany();
  await db.governanceRequirement.deleteMany();
  await db.incidentReport.deleteMany();
  // Not a relation of anything else — identified only by its own
  // (provider, providerEventId) pair, so not covered by any cascade above.
  await db.processedWebhookEvent.deleteMany();
  // userId is a plain correlation field, not a `@relation` (see the
  // SentEmail model comment, prisma/schema.prisma) — not covered by
  // User's cascade above.
  await db.sentEmail.deleteMany();
}
