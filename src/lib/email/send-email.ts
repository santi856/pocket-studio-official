import "server-only";
import { db } from "@/lib/db";
import { getEmailProvider } from "./get-provider";
import type { SendEmailInput } from "./provider";
import type { SentEmail } from "@/generated/prisma/client";

/**
 * The real send entry point (Master Spec §61 "production email"). Every
 * attempt — sent or failed — is recorded as a real SentEmail row; a
 * bounced/rejected send is a real, queryable fact, never silently
 * dropped. Not project-scoped (email is a platform-level concern, like
 * authentication, not a per-customer generated-app capability) —
 * `userId` is optional correlation only, never an authorization boundary,
 * so this has no actor parameter to check against.
 */
export async function sendEmail(input: SendEmailInput & { userId?: string }): Promise<SentEmail> {
  const provider = getEmailProvider();
  const result = await provider.sendEmail(input);

  return db.sentEmail.create({
    data: {
      userId: input.userId,
      provider: provider.name,
      toAddress: input.to,
      subject: input.subject,
      status: result.status,
      providerMessageId: result.status === "SENT" ? result.providerMessageId : null,
      failureReason: result.status === "FAILED" ? result.failureReason : null,
    },
  });
}
