import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailSendResult =
  { status: "SENT"; providerMessageId: string } | { status: "FAILED"; failureReason: string };

/**
 * One interface, swappable implementations — the same pattern established
 * for AIProvider (P3-01), BillingProvider (P3-04), and
 * GeneratedAppPaymentProvider (P3-06). MockEmailProvider is deterministic
 * and sends nothing real; SmtpEmailProvider is a real connection over the
 * one universal, vendor-agnostic standard for sending email (SMTP, RFC
 * 5321) — no specific provider (SES, Postmark, SendGrid, etc.) is picked,
 * matching the same "pick the protocol, not the vendor" posture already
 * taken for OAuth connections (P3-05).
 */
export interface EmailProvider {
  readonly name: "mock" | "smtp";
  sendEmail(input: SendEmailInput): Promise<EmailSendResult>;
}
