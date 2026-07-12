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
