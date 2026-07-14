import "server-only";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import {
  IntegrationRequirementNotFoundError,
  retrieveCredentialSecretForGeneratedApp,
} from "@/lib/credentials/vault";
import { getGeneratedAppPaymentProvider } from "./get-generated-app-payment-provider";
import type { OAuthTokenSet } from "@/lib/integrations/oauth";
import type { GeneratedAppPayment } from "@/generated/prisma/client";

export class PaymentIntegrationNotConnectedError extends Error {
  constructor() {
    super("This project's payment integration is not connected yet.");
    this.name = "PaymentIntegrationNotConnectedError";
  }
}

export class InvalidChargeAmountError extends Error {
  constructor() {
    super("Charge amount must be a positive integer number of cents.");
    this.name = "InvalidChargeAmountError";
  }
}

export type CreateGeneratedAppChargeInput = {
  integrationRequirementId: string;
  generatedAppUserId?: string;
  amountCents: number;
  currency?: string;
  description: string;
  paymentMethodToken?: string;
};

/**
 * The real charge-creation entry point a generated product's own runtime
 * calls on behalf of its end user (Master Spec §61 "customer-owned
 * generated-app payment and subscription connections") — deliberately no
 * actorUserId, the same class of deliberate, disclosed exception as
 * authenticateGeneratedAppUser (P3-02) and
 * applyBillingLifecycleEventFromWebhook (P3-04): there is no Pocket
 * Studio member "acting" when a generated product charges its own
 * customer. Every outcome — success or a real provider decline — is
 * recorded as a GeneratedAppPayment row; a failed charge is never
 * silently dropped.
 */
export async function createGeneratedAppCharge(
  projectId: string,
  input: CreateGeneratedAppChargeInput,
): Promise<GeneratedAppPayment> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new InvalidChargeAmountError();
  }

  const requirement = await db.integrationRequirement.findFirst({
    where: { id: input.integrationRequirementId, projectId },
  });
  if (!requirement) {
    throw new IntegrationRequirementNotFoundError();
  }
  if (requirement.connectionStatus !== "CONNECTED") {
    throw new PaymentIntegrationNotConnectedError();
  }

  const provider = getGeneratedAppPaymentProvider();
  const currency = input.currency ?? "usd";

  const accessToken =
    provider.name === "mock"
      ? "mock"
      : await resolveConnectedAccessToken(projectId, input.integrationRequirementId);

  const result = await provider.createCharge({
    accessToken,
    amountCents: input.amountCents,
    currency,
    description: input.description,
    paymentMethodToken: input.paymentMethodToken,
  });

  return db.generatedAppPayment.create({
    data: {
      projectId,
      integrationRequirementId: input.integrationRequirementId,
      generatedAppUserId: input.generatedAppUserId,
      amountCents: input.amountCents,
      currency,
      description: input.description,
      status: result.status,
      providerChargeId: result.status === "SUCCEEDED" ? result.providerChargeId : null,
      failureReason: result.status === "FAILED" ? result.failureReason : null,
    },
  });
}

async function resolveConnectedAccessToken(
  projectId: string,
  integrationRequirementId: string,
): Promise<string> {
  const secret = await retrieveCredentialSecretForGeneratedApp(projectId, integrationRequirementId);
  if (!secret) {
    throw new PaymentIntegrationNotConnectedError();
  }
  const tokens = JSON.parse(secret) as OAuthTokenSet;
  return tokens.accessToken;
}

/** Pocket-Studio-side visibility into a generated product's real payment history. */
export async function listGeneratedAppPayments(
  actorUserId: string,
  projectId: string,
): Promise<GeneratedAppPayment[]> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  return db.generatedAppPayment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
}
