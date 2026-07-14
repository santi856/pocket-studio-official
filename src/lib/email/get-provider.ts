import "server-only";
import { getServerEnv } from "@/lib/env";
import { MockEmailProvider } from "./mock-provider";
import { SmtpEmailProvider } from "./smtp-provider";
import type { EmailProvider } from "./provider";

let cachedProvider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const env = getServerEnv();
  cachedProvider =
    env.EMAIL_PROVIDER === "smtp" ? new SmtpEmailProvider() : new MockEmailProvider();
  return cachedProvider;
}
