import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "pocket_studio_session";

/**
 * Only callable from a Server Action or Route Handler — Server Components
 * may read cookies but Next.js throws if they try to write them, which is
 * the correct place for this restriction to live (not duplicated here).
 */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}
