import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { decryptSecret, encryptSecret } from "@/lib/credentials/crypto";
import { recordAuditLogEntry } from "@/lib/observability/audit-log";
import type { CredentialReference } from "@/generated/prisma/client";

export class IntegrationRequirementNotFoundError extends Error {
  constructor() {
    super("No integration requirement exists for this credential.");
    this.name = "IntegrationRequirementNotFoundError";
  }
}

/**
 * The only way a secret enters the database: encrypted immediately, never
 * held as a plaintext field anywhere (Master Spec §4.7, §30). Returns
 * metadata only — never the plaintext, never the ciphertext — because
 * nothing that creates a credential needs to see it again in the same
 * call.
 */
export async function storeCredential(
  actorUserId: string,
  projectId: string,
  input: { integrationRequirementId: string; provider: string; secret: string },
): Promise<{ id: string; provider: string; createdAt: Date }> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const requirement = await db.integrationRequirement.findFirst({
    where: { id: input.integrationRequirementId, projectId },
  });
  if (!requirement) {
    throw new IntegrationRequirementNotFoundError();
  }

  const encrypted = encryptSecret(input.secret);

  const record = await db.credentialReference.upsert({
    where: { integrationRequirementId: input.integrationRequirementId },
    create: {
      projectId,
      integrationRequirementId: input.integrationRequirementId,
      provider: input.provider,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      createdByUserId: actorUserId,
    },
    update: {
      provider: input.provider,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    },
  });

  await recordAuditLogEntry({
    organizationId: project.organizationId,
    actorUserId,
    action: "CREDENTIAL_STORED",
    targetType: "CredentialReference",
    targetId: record.id,
    metadata: {
      provider: input.provider,
      integrationRequirementId: input.integrationRequirementId,
    },
  });

  return { id: record.id, provider: record.provider, createdAt: record.createdAt };
}

/**
 * Narrow, explicit, server-only accessor for the plaintext secret — never
 * exported alongside a general "list credentials" function, and never
 * callable from anything that could echo the result to a client, a log,
 * or an AI prompt. Only code that must actually authenticate to the
 * provider (e.g. a future webhook/API call) should import this.
 */
export async function retrieveCredentialSecret(
  actorUserId: string,
  projectId: string,
  integrationRequirementId: string,
): Promise<string | null> {
  const project = await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const record = await db.credentialReference.findFirst({
    where: { integrationRequirementId, projectId },
  });
  if (!record) {
    return null;
  }

  await recordAuditLogEntry({
    organizationId: project.organizationId,
    actorUserId,
    action: "CREDENTIAL_ACCESSED",
    targetType: "CredentialReference",
    targetId: record.id,
    metadata: { provider: record.provider },
  });

  return decryptSecret({ ciphertext: record.ciphertext, iv: record.iv, authTag: record.authTag });
}

/**
 * The generated-app-runtime counterpart to retrieveCredentialSecret —
 * deliberately has no actorUserId and performs no membership check. A
 * generated product's own backend charging its own end user (P3-06,
 * src/lib/generation/generated-app-payments.ts) has no Pocket Studio
 * member "acting"; the customer already authorized this exact use when
 * they connected the credential in the first place (Master Spec §61
 * "customer-owned generated-app payment connections"). Same class of
 * deliberate, disclosed exception as authenticateGeneratedAppUser
 * (src/lib/generation/generated-app-auth.ts, P3-02) and
 * applyBillingLifecycleEventFromWebhook (src/lib/billing/subscription.ts,
 * P3-04) — recorded in
 * src/lib/tenancy/verify-tenant-isolation.ts's ALLOWED_EXCEPTIONS.
 */
export async function retrieveCredentialSecretForGeneratedApp(
  projectId: string,
  integrationRequirementId: string,
): Promise<string | null> {
  const record = await db.credentialReference.findFirst({
    where: { integrationRequirementId, projectId },
  });
  if (!record) {
    return null;
  }

  return decryptSecret({ ciphertext: record.ciphertext, iv: record.iv, authTag: record.authTag });
}

/** Safe to expose broadly — deliberately excludes ciphertext/iv/authTag. */
export type CredentialMetadata = Pick<
  CredentialReference,
  "id" | "provider" | "lastVerifiedAt" | "createdAt" | "updatedAt"
>;

export async function getCredentialMetadata(
  actorUserId: string,
  projectId: string,
  integrationRequirementId: string,
): Promise<CredentialMetadata | null> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.credentialReference.findFirst({
    where: { integrationRequirementId, projectId },
    select: { id: true, provider: true, lastVerifiedAt: true, createdAt: true, updatedAt: true },
  });
}
