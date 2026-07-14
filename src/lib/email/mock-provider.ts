import "server-only";
import type { EmailSendResult, EmailProvider, SendEmailInput } from "./provider";

/**
 * Deterministic, no external connection — the full email-sending contract
 * can be exercised end to end (including recording a real SentEmail row
 * via sendEmail(), src/lib/email/send-email.ts) without a live SMTP
 * server. Rejects an obviously-malformed address the same way a real
 * provider's own validation would, so callers get realistic failure-path
 * coverage even in mock mode.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock" as const;

  async sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
    if (!input.to.includes("@")) {
      return { status: "FAILED", failureReason: `"${input.to}" is not a valid email address.` };
    }
    return { status: "SENT", providerMessageId: `mock_email_${crypto.randomUUID()}` };
  }
}
