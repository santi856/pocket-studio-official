import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { User } from "@/generated/prisma/client";

/**
 * Page-level auth guard. `requireCurrentUser` (src/lib/auth/current-user.ts)
 * throws on no session — correct for service/API code, wrong for a page,
 * where an unauthenticated visitor should land on sign-in, not a 500.
 * Every protected Server Component page calls this instead of
 * `requireCurrentUser` directly.
 */
export async function requireUserForPage(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}

/**
 * The same guard, for Server Actions. An action whose session has expired
 * (or was never present — a forged direct POST) must redirect to sign-in
 * like any other unauthenticated request, not crash to Next.js's raw error
 * page the way `requireCurrentUser`'s throw would. Every `"use server"`
 * action calls this instead of `requireCurrentUser` directly (Phase 2
 * Level 3 review round 1 finding: no action previously caught
 * `UnauthenticatedError`).
 */
export async function requireCurrentUserForAction(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}
