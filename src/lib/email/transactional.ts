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
