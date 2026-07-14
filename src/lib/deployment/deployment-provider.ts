import "server-only";
import type { DeploymentEnvironment } from "@/generated/prisma/client";

export type DeployInput = {
  environment: DeploymentEnvironment;
  projectSlug: string;
  blueprintVersion: number;
  buildPlanVersion: number;
};

export type DeployResult =
  | { status: "SUCCEEDED"; providerDeploymentId: string }
  | { status: "FAILED"; failureReason: string };

/**
 * One interface, swappable implementations — the same pattern established
 * for AIProvider (P3-01), BillingProvider (P3-04), and
 * GeneratedAppPaymentProvider (P3-06). Unlike those, there is no universal
 * vendor-agnostic protocol to implement directly here (deployment hosting
 * has no equivalent of SMTP/OAuth2) and no hosting vendor is named
 * anywhere in Master Spec, so only a mock implementation exists today —
 * picking a specific vendor (Vercel, Netlify, AWS, etc.) would be an
 * unauthorized product decision this build has no authority to make. The
 * Deployment record-keeping and rollback state machine (src/lib/deployment/
 * deployments.ts) are real and fully tested independent of which provider
 * performs the underlying push.
 */
export interface DeploymentProvider {
  readonly name: "mock";
  deploy(input: DeployInput): Promise<DeployResult>;
}
