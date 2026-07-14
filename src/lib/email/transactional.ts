import "server-only";
import { sendEmail } from "./send-email";
import type { SentEmail } from "@/generated/prisma/client";

/**
 * Master Spec §61 "production email" — the first real transactional
 * trigger: every new account gets a real welcome email attempt. Awaited
 * (not true fire-and-forget) because Next.js Server Actions can have
 * their execution context torn down immediately after redirect() in some
 * deployment topologies — an unawaited async call has no guarantee of
 * completing. A failed send must never block sign-up, so any error here
 * is caught, not propagated; the attempt itself (sent or failed) is
 * always durably recorded via sendEmail().
 */
export async function sendWelcomeEmail(input: {
  userId: string;
  toAddress: string;
  name: string | null;
}): Promise<SentEmail | null> {
  const greeting = input.name ? `Hi ${input.name},` : "Hi,";
  try {
    return await sendEmail({
      userId: input.userId,
      to: input.toAddress,
      subject: "Welcome to Pocket Studio",
      text: `${greeting}\n\nWelcome to Pocket Studio — your account is ready. Sign in any time to keep building your product.`,
      html: `<p>${greeting}</p><p>Welcome to Pocket Studio — your account is ready. Sign in any time to keep building your product.</p>`,
    });
  } catch {
    return null;
  }
}

/**
 * Master Spec §61 "customer notification and remediation" — the
 * governance-monitoring pipeline's notification step (§33: "... →
 * customer notification → approval → ..."). Same await-and-swallow
 * pattern as sendWelcomeEmail: a failed send must never block the
 * governance workflow itself, and the attempt is always durably recorded
 * via sendEmail() regardless of outcome.
 */
export async function sendGovernanceImpactNotificationEmail(input: {
  userId: string;
  toAddress: string;
  projectName: string;
  changeSummary: string;
  remediationProposal: string | null;
}): Promise<SentEmail | null> {
  const remediationLine = input.remediationProposal
    ? `Proposed remediation: ${input.remediationProposal}`
    : "A remediation proposal has not been drafted yet.";
  try {
    return await sendEmail({
      userId: input.userId,
      to: input.toAddress,
      subject: `Governance update affecting "${input.projectName}"`,
      text: `A governance or legal requirement change has been identified as affecting "${input.projectName}".\n\n${input.changeSummary}\n\n${remediationLine}\n\nSign in to Pocket Studio to review and approve remediation.`,
      html: `<p>A governance or legal requirement change has been identified as affecting "${input.projectName}".</p><p>${input.changeSummary}</p><p>${remediationLine}</p><p>Sign in to Pocket Studio to review and approve remediation.</p>`,
    });
  } catch {
    return null;
  }
}
