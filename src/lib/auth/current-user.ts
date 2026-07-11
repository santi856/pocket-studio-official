import "server-only";
import { cache } from "react";
import type { User } from "@/generated/prisma/client";
import { getSessionTokenFromCookies } from "@/lib/auth/cookies";
import { verifySessionToken } from "@/lib/auth/session";

export class UnauthenticatedError extends Error {
  constructor() {
    super("No authenticated user for this request.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * `cache()` deduplicates this within a single request/render pass so every
 * Server Component that needs the current user can call it directly without
 * threading it through props or re-querying the database per component.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = await getSessionTokenFromCookies();
  if (!token) {
    return null;
  }

  const result = await verifySessionToken(token);
  return result?.user ?? null;
});

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}
